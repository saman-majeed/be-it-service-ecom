/**
 * Seed sample SEO settings, backlinks, and parasite campaigns.
 * Run: node scripts/seed-seo.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { getMongoUri } = require('../lib/mongoUri');
const SiteSeo = require('../models/SiteSeo');
const Backlink = require('../models/Backlink');
const ParasiteCampaign = require('../models/ParasiteCampaign');

async function run() {
  await mongoose.connect(getMongoUri(), {
    serverSelectionTimeoutMS: 15000,
    tls: true,
    tlsAllowInvalidCertificates: true,
  });

  await SiteSeo.deleteMany({});
  await SiteSeo.create({
    siteName: 'Be IT:Service',
    defaultTitle: 'Be IT:Service — IT Repair, Virus Removal & Hardware',
    homeTitle: 'Be IT:Service — Repair & Boost Your Computer',
    defaultDescription:
      'Expert IT repair, virus removal, screen replacement, and hardware upgrades. Fast service and transparent pricing.',
    canonicalBaseUrl: process.env.SITE_URL || 'http://localhost:3000',
    allowIndexing: true,
    enableJsonLd: true,
  });

  const samples = [
    {
      partnerName: 'Node.js',
      targetUrl: 'https://nodejs.org',
      anchorText: 'Powered by Node.js',
      linkType: 'nofollow',
      direction: 'outbound',
      status: 'active',
      showOnFooter: true,
      showOnResources: true,
      slug: 'nodejs',
    },
    {
      partnerName: 'MongoDB Atlas',
      targetUrl: 'https://www.mongodb.com/atlas',
      anchorText: 'Cloud database',
      linkType: 'nofollow',
      direction: 'outbound',
      status: 'active',
      showOnResources: true,
      slug: 'mongodb-atlas',
    },
  ];

  for (const s of samples) {
    await Backlink.findOneAndUpdate({ slug: s.slug }, s, { upsert: true, new: true });
  }

  await ParasiteCampaign.findOneAndUpdate(
    { title: '5 Signs Your PC Needs a Professional Cleanup' },
    {
      platform: 'Medium',
      title: '5 Signs Your PC Needs a Professional Cleanup',
      externalUrl: '',
      targetPage: '/',
      anchorText: 'IT repair services',
      utmSource: 'medium',
      utmCampaign: 'pc-cleanup-guide',
      status: 'draft',
    },
    { upsert: true }
  );

  console.log('✅ SEO seed complete: site settings, sample backlinks, parasite campaign');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
