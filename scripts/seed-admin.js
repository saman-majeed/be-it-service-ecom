/**
 * Creates the first admin user in the MongoDB "admin" collection.
 * Usage: node scripts/seed-admin.js
 * Optional env: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { getMongoUri } = require('../lib/mongoUri');
const Admin = require('../models/Admin');

const name = process.env.ADMIN_NAME || 'Site Admin';
const email = process.env.ADMIN_EMAIL || 'admin@beit.com';
const password = process.env.ADMIN_PASSWORD || 'Admin@12345';

async function main() {
  await mongoose.connect(getMongoUri(), {
    serverSelectionTimeoutMS: 15000,
    tls: true,
    tlsAllowInvalidCertificates: true,
  });

  const existing = await Admin.findOne({ email });
  if (existing) {
    console.log(`Admin already exists: ${email}`);
    console.log('No changes made. Use Atlas to edit or delete that document if needed.');
    await mongoose.disconnect();
    return;
  }

  const admin = new Admin({ name, email, password, role: 'admin' });
  await admin.save();

  console.log('Admin created in collection "admin":');
  console.log(`  Name:  ${name}`);
  console.log(`  Email: ${email}`);
  console.log(`  Password: (the value you set — default is Admin@12345 if unset)`);
  console.log('\nLogin at: http://localhost:3000/admin');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
