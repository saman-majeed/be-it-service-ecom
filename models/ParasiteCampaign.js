const mongoose = require('mongoose');

const parasiteCampaignSchema = new mongoose.Schema({
  platform: {
    type: String,
    required: true,
    enum: ['Medium', 'LinkedIn', 'Quora', 'Reddit', 'YouTube', 'Guest Blog', 'Other'],
  },
  title: { type: String, required: true },
  externalUrl: { type: String, default: '' },
  targetPage: { type: String, default: '/' },
  anchorText: { type: String, default: '' },
  utmSource: { type: String, default: '' },
  utmMedium: { type: String, default: 'parasite' },
  utmCampaign: { type: String, default: '' },
  status: {
    type: String,
    enum: ['draft', 'published', 'monitoring', 'archived'],
    default: 'draft',
  },
  publishedAt: { type: Date },
  notes: { type: String, default: '' },
  clickCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('ParasiteCampaign', parasiteCampaignSchema);
