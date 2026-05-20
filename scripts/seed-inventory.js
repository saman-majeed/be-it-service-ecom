/**
 * Backfill stock, cost, reorder level, and price history for existing products.
 * Usage: node scripts/seed-inventory.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { getMongoUri } = require('../lib/mongoUri');
const Product = require('../models/Product');
const { defaultStock } = require('../services/inventoryAnalytics');

async function main() {
  await mongoose.connect(getMongoUri(), {
    serverSelectionTimeoutMS: 15000,
    tls: true,
    tlsAllowInvalidCertificates: true,
  });

  const products = await Product.find();
  let updated = 0;

  for (const p of products) {
    const patch = {};
    if (p.stock == null || p.stock === undefined) patch.stock = defaultStock(p.category);
    if (!p.costPrice) patch.costPrice = Math.round(p.price * 0.65 * 100) / 100;
    if (p.reorderLevel == null || p.reorderLevel === undefined) {
      patch.reorderLevel = Math.max(5, Math.floor((patch.stock || p.stock || 50) * 0.2));
    }
    if (!p.priceHistory || !p.priceHistory.length) {
      patch.priceHistory = [
        { price: p.price * 0.9, recordedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) },
        { price: p.price, recordedAt: new Date() },
      ];
    }
    if (Object.keys(patch).length) {
      await Product.updateOne({ _id: p._id }, { $set: patch });
      updated++;
    }
  }

  console.log(`Inventory seed complete. Updated ${updated} of ${products.length} products.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
