const mongoose = require('mongoose');

const siteSeoSchema = new mongoose.Schema({
  siteName: { type: String, default: 'Be IT:Service' },
  defaultTitle: { type: String, default: 'Be IT:Service - IT Repair & E-Commerce Solutions' },
  defaultDescription: {
    type: String,
    default: 'Professional IT repair, virus removal, hardware upgrades, and software services. Fast turnaround and trusted support.',
  },
  defaultKeywords: {
    type: String,
    default: 'IT repair, computer repair, virus removal, hardware upgrade, IT services, ecommerce',
  },
  homeTitle: { type: String, default: '' },
  homeDescription: { type: String, default: '' },
  canonicalBaseUrl: { type: String, default: '' },
  ogImage: { type: String, default: '/images/og-default.svg' },
  twitterHandle: { type: String, default: '@beit_service' },
  googleSiteVerification: { type: String, default: '' },
  bingSiteVerification: { type: String, default: '' },
  allowIndexing: { type: Boolean, default: true },
  enableJsonLd: { type: Boolean, default: true },
  enableCompression: { type: Boolean, default: true },
  offPageChecklist: {
    type: String,
    default: 'Guest posts on tech blogs\nGoogle Business Profile\nDirectory listings (Yelp, Bing Places)\nSocial profiles linking to homepage\nPartner / supplier mentions',
  },
  parasiteStrategy: {
    type: String,
    default: 'Publish helpful IT guides on Medium, LinkedIn Articles, and Quora with links back to product pages using UTM tracking.',
  },
  updatedAt: { type: Date, default: Date.now },
}, { collection: 'site_seo' });

siteSeoSchema.statics.getSettings = async function getSettings() {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

module.exports = mongoose.model('SiteSeo', siteSeoSchema);
