const Product = require('../models/Product');
const Order = require('../models/Order');

const DAY_MS = 24 * 60 * 60 * 1000;
const CRITICAL_STOCK_MAX = 3;
const LOW_STOCK_MAX = 6;

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function defaultStock(category) {
  const map = { Software: 80, Hardware: 45, Service: 120 };
  return map[category] || 50;
}

function normalizeProduct(p) {
  const stock = num(p.stock, defaultStock(p.category));
  const costPrice = num(p.costPrice, p.price * 0.65);
  const reorderLevel = num(p.reorderLevel, Math.max(5, Math.floor(stock * 0.2)));
  return { ...p.toObject?.() || p, stock, costPrice, reorderLevel };
}

function getStockStatus(stock, reorderLevel) {
  if (stock <= 0) return { code: 'OUT', label: 'OUT', filter: 'out' };
  if (stock <= CRITICAL_STOCK_MAX) return { code: 'CRITICAL', label: 'CRITICAL', filter: 'critical' };
  if (stock <= LOW_STOCK_MAX || stock <= reorderLevel) return { code: 'LOW', label: 'LOW', filter: 'critical' };
  return { code: 'HEALTHY', label: 'HEALTHY', filter: 'ok' };
}

function buildSalesLedger(orders, products) {
  const byProduct = {};
  const byCategory = {};
  const daily = {};
  const monthlyRevenue = {};

  const nameToId = {};
  for (const p of products) {
    nameToId[p.name?.toLowerCase()] = p._id.toString();
  }

  for (const order of orders) {
    const orderDate = new Date(order.date);
    const dayKey = orderDate.toISOString().slice(0, 10);
    const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;

    if (!daily[dayKey]) daily[dayKey] = { total: 0, revenue: 0, byCategory: {} };
    monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + num(order.total);

    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      let id = item._id?.toString?.() || item._id;
      if (!id && item.name) id = nameToId[item.name.toLowerCase()] || item.name;
      const category = item.category || 'Other';
      const qty = 1;
      const revenue = num(item.price);

      if (!byProduct[id]) {
        byProduct[id] = {
          id,
          name: item.name || 'Unknown',
          category,
          unitsSold: 0,
          revenue: 0,
        };
      }
      byProduct[id].unitsSold += qty;
      byProduct[id].revenue += revenue;

      byCategory[category] = (byCategory[category] || 0) + qty;
      daily[dayKey].total += qty;
      daily[dayKey].revenue += revenue;
      daily[dayKey].byCategory[category] = (daily[dayKey].byCategory[category] || 0) + qty;
    }
  }

  return { byProduct, byCategory, daily, monthlyRevenue };
}

function buildStockHealthRows(products, salesByProduct) {
  const maxStock = Math.max(...products.map((p) => p.stock), 1);

  return products.map((raw) => {
    const p = normalizeProduct(raw);
    const id = p._id.toString();
    const sold = salesByProduct[id]?.unitsSold || 0;
    const status = getStockStatus(p.stock, p.reorderLevel);

    return {
      id,
      name: p.name,
      category: p.category,
      iconClass: p.iconClass || 'fa-solid fa-tag',
      stock: p.stock,
      maxStock,
      stockPct: Math.round((p.stock / maxStock) * 100),
      unitsSold: sold,
      status: status.label,
      statusCode: status.code,
      filter: status.filter,
    };
  });
}

function buildPriceAlerts(products) {
  const alerts = [];

  for (const raw of products) {
    const p = normalizeProduct(raw);
    const history = Array.isArray(p.priceHistory) ? [...p.priceHistory] : [];
    if (!history.length) continue;

    const sorted = history
      .map((h) => ({ price: num(h.price), date: new Date(h.recordedAt || h.date) }))
      .sort((a, b) => a.date - b.date);

    const oldPrice = sorted[0].price;
    const newPrice = num(p.price);
    if (oldPrice <= 0 || newPrice <= oldPrice) continue;

    const changePct = ((newPrice - oldPrice) / oldPrice) * 100;
    if (changePct < 5) continue;

    alerts.push({
      id: p._id.toString(),
      name: p.name,
      iconClass: p.iconClass || 'fa-solid fa-tag',
      oldPrice,
      newPrice,
      changePct: Number(changePct.toFixed(0)),
      action: changePct >= 15 ? 'Monitor' : 'Review',
    });
  }

  return alerts.sort((a, b) => b.changePct - a.changePct);
}

function buildTopSelling(products, salesByProduct) {
  const rows = products.map((raw) => {
    const p = normalizeProduct(raw);
    const id = p._id.toString();
    const sales = salesByProduct[id] || { unitsSold: 0, revenue: 0 };

    return {
      id,
      name: p.name,
      category: p.category,
      iconClass: p.iconClass || 'fa-solid fa-tag',
      price: num(p.price),
      stock: p.stock,
      unitsSold: sales.unitsSold,
      revenue: Number(sales.revenue.toFixed(2)),
    };
  });

  rows.sort((a, b) => b.unitsSold - a.unitsSold || b.revenue - a.revenue);

  const maxUnits = Math.max(...rows.map((r) => r.unitsSold), 1);
  return rows.map((r, i) => ({
    ...r,
    rank: i + 1,
    performancePct: Math.round((r.unitsSold / maxUnits) * 100),
  }));
}

function buildKpis(stockHealthRows, priceAlerts) {
  return {
    outOfStock: stockHealthRows.filter((r) => r.statusCode === 'OUT').length,
    criticalStock: stockHealthRows.filter((r) => r.statusCode === 'CRITICAL').length,
    priceAlert: priceAlerts.length,
    healthyStock: stockHealthRows.filter((r) => r.statusCode === 'HEALTHY').length,
  };
}

function buildInsightBanner(kpis, categoryInsights, priceAlerts, topSelling) {
  const parts = [];
  const best = categoryInsights[0];
  if (best && best.unitsSold > 0) {
    parts.push(
      `'${best.category}' is your best-selling category — consider expanding this inventory.`
    );
  }
  if (kpis.outOfStock > 0) {
    parts.push(`${kpis.outOfStock} product(s) are out of stock — restock immediately.`);
  }
  if (kpis.criticalStock > 0) {
    parts.push(`${kpis.criticalStock} product(s) have critical stock (≤${CRITICAL_STOCK_MAX} units).`);
  }
  if (priceAlerts.length > 0) {
    parts.push(
      `${priceAlerts.length} product(s) have significant price increases — review pricing to avoid losing customers.`
    );
  }
  const top = topSelling.find((t) => t.unitsSold > 0);
  if (top && !best) {
    parts.push(`'${top.name}' is a top performer with ${top.unitsSold} unit(s) sold.`);
  }
  if (!parts.length) {
    parts.push('Inventory is stable. Add orders and update stock levels for richer AI insights.');
  }
  return parts.join(' ');
}

function buildRevenueTrend(monthlyRevenue) {
  const keys = Object.keys(monthlyRevenue).sort().slice(-6);
  return {
    labels: keys.map((k) => {
      const [y, m] = k.split('-');
      return new Date(Number(y), Number(m) - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
    }),
    values: keys.map((k) => monthlyRevenue[k]),
  };
}

function buildCategorySales(byCategory) {
  return Object.entries(byCategory)
    .map(([category, unitsSold]) => ({ category, unitsSold }))
    .sort((a, b) => b.unitsSold - a.unitsSold);
}

async function buildInventoryDashboard() {
  const [products, orders] = await Promise.all([
    Product.find().lean(),
    Order.find().sort({ date: -1 }).lean(),
  ]);

  const normalized = products.map(normalizeProduct);
  const { byProduct, byCategory, daily, monthlyRevenue } = buildSalesLedger(orders, normalized);

  const stockHealth = buildStockHealthRows(normalized, byProduct);
  const priceAlerts = buildPriceAlerts(normalized);
  const topSelling = buildTopSelling(normalized, byProduct);
  const categoryInsights = buildCategorySales(byCategory).map((c) => ({
    ...c,
    revenue: normalized
      .filter((p) => p.category === c.category)
      .reduce((s, p) => s + (byProduct[p._id.toString()]?.revenue || 0), 0),
  }));
  const kpis = buildKpis(stockHealth, priceAlerts);
  const insightBanner = buildInsightBanner(kpis, categoryInsights, priceAlerts, topSelling);
  const revenueTrend = buildRevenueTrend(monthlyRevenue);
  const categorySales = buildCategorySales(byCategory);

  return {
    generatedAt: new Date().toISOString(),
    insightBanner,
    kpis,
    stockHealth,
    priceAlerts,
    topSelling,
    categorySales,
    categoryInsights,
    revenueTrend,
    summary: {
      totalProducts: normalized.length,
      totalOrders: orders.length,
    },
  };
}

module.exports = {
  buildInventoryDashboard,
  normalizeProduct,
  defaultStock,
};
