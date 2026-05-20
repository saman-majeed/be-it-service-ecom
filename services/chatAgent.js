const Product = require('../models/Product');
const Order = require('../models/Order');
const { getGroqChatReply } = require('./inventoryAI');
const {
  normalizeMessage,
  isProductBrowseIntent,
  isLoadMoreIntent,
  getBrowseQuery,
  recordBrowseBatch,
  mapProductForChat,
  buildIntro,
} = require('../lib/chatProducts');

const FAQ = {
  shipping: {
    title: 'Shipping & Delivery',
    text: 'Most IT repairs and services are completed within 4 business days. Hardware parts may take 5–7 business days depending on stock.',
  },
  return: {
    title: 'Return Policy',
    text: 'We offer a 30-day return policy on most hardware repairs and software services. Contact support with your order ID for returns.',
  },
  payment: {
    title: 'Payment Methods',
    text: 'We accept Cash on Delivery (COD) and Online Card payments. Coupons like SAVE10 give 10% off at checkout.',
  },
};

function escapeRegex(str) {
  return String(str).replace(/[.*+?^$()|[\]\\]/g, '\\$&');
}

function detectIntent(message) {
  const m = normalizeMessage(message);

  if (/\b(shipping|delivery|how long|when will it arrive)\b/.test(m)) return { type: 'faq', topic: 'shipping' };
  if (/\b(return|refund|money back)\b/.test(m)) return { type: 'faq', topic: 'return' };
  if (/\b(payment|pay|cod|card|how to pay)\b/.test(m)) return { type: 'faq', topic: 'payment' };

  if (/\b(where is my order|track order|order status|tracking)\b/.test(m) || (/\border\b/.test(m) && /\b(status|track)\b/.test(m))) {
    return { type: 'order_track' };
  }

  if (/\b(view cart|show cart|my cart|what'?s in my cart)\b/.test(m)) return { type: 'cart_view' };
  if (/\b(remove|delete)\b/.test(m) && /\b(cart|from cart)\b/.test(m)) return { type: 'cart_remove', query: extractProductQuery(message) };
  if (/\b(add|put)\b/.test(m) && /\b(cart|to cart)\b/.test(m)) return { type: 'cart_add', query: extractProductQuery(message) };

  if (/\b(coupon|promo|discount code|apply)\b/.test(m) || /\bSAVE10\b/i.test(message)) {
    const code = message.match(/\b([A-Z0-9]{4,12})\b/)?.[1] || 'SAVE10';
    return { type: 'coupon', code };
  }

  if (/\b(trending|best seller|popular|top selling)\b/.test(m)) return { type: 'recommend', subtype: 'trending' };
  if (/\b(also bought|frequently bought|customers also)\b/.test(m)) return { type: 'recommend', subtype: 'also_bought' };
  if (/\b(recommend|suggestion|for me|personalized)\b/.test(m)) return { type: 'recommend', subtype: 'personal' };

  if (isProductBrowseIntent(message)) return { type: 'browse' };

  const searchFilters = parseSearchFilters(message);
  if (searchFilters) return { type: 'search', filters: searchFilters };

  return { type: 'general' };
}

function extractProductQuery(message) {
  return message
    .replace(/\b(add|remove|put|delete|to|from|my|the|cart|please|a|an)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSearchFilters(message) {
  const m = normalizeMessage(message);
  if (isProductBrowseIntent(message)) return null;

  const hasSearch =
    /\b(find|search|looking for)\b/.test(m) ||
    /\bunder\b/.test(m) ||
    /\b(below|less than|cheaper than)\b/.test(m) ||
    (/\b(show|need|want)\b/.test(m) && /\bunder\b/.test(m));

  if (!hasSearch) return null;

  const filters = { category: null, maxPrice: null, minPrice: null, keywords: [] };

  const under = m.match(/(?:under|below|less than|cheaper than)\s*\$?\s*(\d+(?:\.\d+)?)/);
  const over = m.match(/(?:over|above|more than)\s*\$?\s*(\d+(?:\.\d+)?)/);
  if (under) filters.maxPrice = Number(under[1]);
  if (over) filters.minPrice = Number(over[1]);

  if (/\bsoftware\b/.test(m)) filters.category = 'Software';
  else if (/\bhardware\b/.test(m)) filters.category = 'Hardware';
  else if (/\bservice\b/.test(m) && !/\bservices\b/.test(m)) filters.category = 'Service';

  const stop = new Set(['show', 'me', 'find', 'search', 'for', 'the', 'a', 'an', 'under', 'below', 'above', 'over', 'with', 'in', 'my', 'need', 'want', 'get', 'looking', 'services', 'products', 'items', 'software', 'hardware', 'service', 'than', 'less', 'more', 'cheaper']);
  filters.keywords = m
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w) && !/^\d+$/.test(w));

  return filters;
}

function buildMongoQuery(filters) {
  const q = {};
  if (filters.category) q.category = filters.category;
  if (filters.maxPrice != null) q.price = { ...(q.price || {}), $lte: filters.maxPrice };
  if (filters.minPrice != null) q.price = { ...(q.price || {}), $gte: filters.minPrice };
  if (filters.keywords?.length) {
    const pattern = filters.keywords.join('|');
    q.$or = [
      { name: { $regex: pattern, $options: 'i' } },
      { description: { $regex: pattern, $options: 'i' } },
      { category: { $regex: pattern, $options: 'i' } },
    ];
  }
  return q;
}

function extractEmail(message) {
  return message.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || null;
}

function buildOrderTimeline(order) {
  const status = order.status || 'Placed';
  const steps = [
    { label: 'Order Placed', state: 'done', note: new Date(order.date).toLocaleString() },
    { label: 'Processing', state: status === 'Placed' ? 'pending' : 'done' },
    { label: 'Delivered', state: status === 'Delivered' ? 'done' : status === 'Processing' ? 'current' : 'pending' },
  ];
  if (status === 'Processing') steps[1].state = 'current';
  return {
    id: order._id.toString(),
    shortId: order._id.toString().slice(-6).toUpperCase(),
    email: order.email,
    total: order.total,
    status,
    steps,
    items: (order.items || []).map((i) => i.name).join(', ') || '—',
  };
}

async function getTrendingProducts(limit = 6) {
  const orders = await Order.find().sort({ date: -1 }).limit(200).lean();
  const counts = {};
  for (const o of orders) {
    for (const item of o.items || []) {
      const key = item._id?.toString() || item.name;
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
  const ids = sorted.map(([id]) => id).filter((id) => /^[a-f0-9]{24}$/i.test(id));
  const names = sorted.map(([id]) => id).filter((id) => !/^[a-f0-9]{24}$/i.test(id));

  let products = await Product.find({ _id: { $in: ids } }).lean();
  if (products.length < limit && names.length) {
    const byName = await Product.find({
      name: { $in: names.map((n) => new RegExp(n, 'i')) },
    }).limit(limit);
    products = [...products, ...byName];
  }
  if (!products.length) products = await Product.find().sort({ createdAt: -1 }).limit(limit).lean();
  return products;
}

async function getAlsoBought(session, limit = 5) {
  const seed = session.cart?.[0] || session.lastViewedProduct;
  if (!seed) return getTrendingProducts(limit);

  const seedName = seed.name || '';
  const orders = await Order.find({ 'items.name': seedName }).limit(50).lean();
  const counts = {};
  for (const o of orders) {
    for (const item of o.items || []) {
      if (item.name === seedName) continue;
      const key = item._id?.toString() || item.name;
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  const topIds = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)
    .filter((id) => /^[a-f0-9]{24}$/i.test(id));

  let products = await Product.find({ _id: { $in: topIds } }).lean();
  if (!products.length) return getTrendingProducts(limit);
  return products;
}

async function getPersonalized(session, limit = 6) {
  const email = session.user?.email;
  if (!email) return getTrendingProducts(limit);

  const orders = await Order.find({ email }).sort({ date: -1 }).limit(20).lean();
  const categories = {};
  for (const o of orders) {
    for (const item of o.items || []) {
      if (item.category) categories[item.category] = (categories[item.category] || 0) + 1;
    }
  }
  const topCat = Object.entries(categories).sort((a, b) => b[1] - a[1])[0]?.[0];
  const query = topCat ? { category: topCat } : {};
  return Product.find(query).limit(limit).lean();
}

async function findProductByQuery(query) {
  if (!query) return null;
  const byId = await Product.findById(query).catch(() => null);
  if (byId) return byId;
  return Product.findOne({ name: { $regex: escapeRegex(query), $options: 'i' } });
}

function cartSummary(session) {
  const cart = session.cart || [];
  let subtotal = 0;
  cart.forEach((i) => { subtotal += Number(i.price || 0); });
  const coupon = session.chatCoupon || null;
  const discount = coupon === 'SAVE10' ? subtotal * 0.1 : 0;
  return {
    items: cart.map((i) => ({
      id: i._id?.toString(),
      name: i.name,
      price: Number(i.price),
      category: i.category,
    })),
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    total: Number((subtotal - discount).toFixed(2)),
    coupon,
    count: cart.length,
  };
}

function checkAbandonedCart(session) {
  if (!session.cart?.length) return null;
  const last = session.lastChatAt ? new Date(session.lastChatAt).getTime() : 0;
  const mins = (Date.now() - last) / 60000;
  if (mins > 15 && mins < 24 * 60) {
    return `You still have ${session.cart.length} item(s) in your cart ($${cartSummary(session).subtotal}). Ready to checkout?`;
  }
  return null;
}

async function handleBrowse(session, message) {
  const { filter, skip, limit, isMore } = getBrowseQuery(session, message);
  const query = filter ? { category: filter } : {};
  const [products, total] = await Promise.all([
    Product.find(query).select('name category price iconClass').sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(query),
  ]);

  if (!products.length) {
    return {
      type: 'text',
      reply: isMore
        ? "You've seen all our services. Visit the Offer section for more!"
        : "I couldn't find products matching that. Try a different search?",
    };
  }

  recordBrowseBatch(session, skip, products.length);
  return {
    type: 'product_list',
    intro: buildIntro({ filter, isMore, count: products.length, hasMore: skip + products.length < total }),
    products: products.map(mapProductForChat),
    hasMore: skip + products.length < total,
  };
}

async function handleSearch(session, message, filters) {
  const query = buildMongoQuery(filters);
  const products = await Product.find(query).select('name category price iconClass').limit(12).lean();

  const filterDesc = [];
  if (filters.maxPrice != null) filterDesc.push(`under $${filters.maxPrice}`);
  if (filters.category) filterDesc.push(filters.category);
  if (filters.keywords?.length) filterDesc.push(`"${filters.keywords.join(' ')}"`);

  if (!products.length) {
    return {
      type: 'text',
      reply: `No services found ${filterDesc.length ? `for ${filterDesc.join(', ')}` : ''}. Try "show me services" to browse all.`,
    };
  }

  return {
    type: 'product_list',
    intro: `Here are ${products.length} match${products.length === 1 ? '' : 'es'} ${filterDesc.length ? `(${filterDesc.join(', ')})` : ''} ✦`,
    products: products.map(mapProductForChat),
    hasMore: false,
  };
}

async function handleChatMessage(message, session) {
  session.lastChatAt = new Date();
  const abandonedNote = checkAbandonedCart(session);
  const intent = detectIntent(message);

  let response;

  switch (intent.type) {
    case 'faq':
      response = {
        type: 'faq',
        title: FAQ[intent.topic].title,
        reply: FAQ[intent.topic].text,
      };
      break;

    case 'order_track': {
      const email = session.user?.email || extractEmail(message);
      if (!email) {
        response = {
          type: 'text',
          reply: 'To track your order, please log in or tell me your order email (e.g. you@email.com).',
        };
        break;
      }
      const orders = await Order.find({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') })
        .sort({ date: -1 })
        .limit(3)
        .lean();
      if (!orders.length) {
        response = { type: 'text', reply: `No orders found for ${email}.` };
        break;
      }
      response = {
        type: 'order_timeline',
        intro: `Found ${orders.length} order(s) for ${email}:`,
        orders: orders.map(buildOrderTimeline),
      };
      break;
    }

    case 'cart_view':
      response = {
        type: 'cart_summary',
        ...cartSummary(session),
        reply: session.cart?.length ? 'Here is your cart:' : 'Your cart is empty. Say "show me services" to add items.',
      };
      break;

    case 'cart_add': {
      const product = await findProductByQuery(intent.query);
      if (!product) {
        response = { type: 'text', reply: `I couldn't find "${intent.query}". Try the exact service name or "show me services".` };
        break;
      }
      if (!session.cart) session.cart = [];
      session.cart.push(product.toObject ? product.toObject() : product);
      session.lastViewedProduct = product.toObject ? product.toObject() : product;
      response = {
        type: 'text',
        reply: `Added "${product.name}" to your cart ($${product.price}). Say "view cart" or go to checkout.`,
      };
      break;
    }

    case 'cart_remove': {
      const q = intent.query?.toLowerCase();
      const before = session.cart?.length || 0;
      session.cart = (session.cart || []).filter(
        (i) => !i.name?.toLowerCase().includes(q) && i._id?.toString() !== q
      );
      const removed = before - (session.cart?.length || 0);
      response = {
        type: 'cart_summary',
        ...cartSummary(session),
        reply: removed ? `Removed item(s) matching "${intent.query}".` : `No matching item in cart.`,
      };
      break;
    }

    case 'coupon': {
      const code = (intent.code || '').toUpperCase();
      if (code === 'SAVE10') {
        session.chatCoupon = code;
        response = {
          type: 'text',
          reply: 'Coupon SAVE10 applied (10% off). Discount shows when you checkout. Say "view cart" to see totals.',
        };
      } else {
        response = { type: 'text', reply: `Unknown coupon "${code}". Try SAVE10 for 10% off.` };
      }
      break;
    }

    case 'recommend': {
      let products;
      let intro;
      if (intent.subtype === 'trending') {
        products = await getTrendingProducts(6);
        intro = 'Trending services (based on recent orders) ✦';
      } else if (intent.subtype === 'also_bought') {
        products = await getAlsoBought(session, 6);
        intro = 'Customers also bought ✦';
      } else {
        products = await getPersonalized(session, 6);
        intro = session.user ? 'Recommended for you ✦' : 'Popular picks for you ✦';
      }
      response = {
        type: 'product_list',
        intro,
        products: products.map(mapProductForChat),
        hasMore: false,
      };
      break;
    }

    case 'search':
      response = await handleSearch(session, message, intent.filters);
      break;

    case 'browse':
      response = await handleBrowse(session, message);
      break;

    default: {
      try {
        const reply = await getGroqChatReply(message, {
          store: 'Be IT:Service',
          hint: 'User can say: show me services, find hardware under $100, track order, view cart, apply SAVE10',
        });
        response = { type: 'text', reply };
      } catch {
        response = {
          type: 'text',
          reply: 'I can help you search services, track orders, manage your cart, and answer FAQs. Try "show me services" or "track my order".',
        };
      }
    }
  }

  if (abandonedNote && response.type === 'text') {
    response.reply = `${abandonedNote}\n\n${response.reply}`;
  }

  return response;
}

async function getAutocomplete(query) {
  if (!query || query.length < 2) return [];
  const products = await Product.find({
    $or: [
      { name: { $regex: query, $options: 'i' } },
      { category: { $regex: query, $options: 'i' } },
    ],
  })
    .select('name category price')
    .limit(6)
    .lean();

  return products.map((p) => ({
    label: p.name,
    sub: `${p.category} · $${p.price}`,
    query: `show me ${p.name}`,
  }));
}

module.exports = { handleChatMessage, getAutocomplete, cartSummary };
