const mongoose = require('mongoose');

const backlinkSchema = new mongoose.Schema({
  partnerName: { type: String, required: true },
  targetUrl: { type: String, required: true },
  anchorText: { type: String, default: '' },
  linkType: {
    type: String,
    enum: ['dofollow', 'nofollow', 'sponsored', 'ugc'],
    default: 'nofollow',
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound', 'mutual'],
    default: 'outbound',
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'lost'],
    default: 'pending',
  },
  domainAuthority: { type: Number, min: 0, max: 100, default: 0 },
  notes: { type: String, default: '' },
  showOnFooter: { type: Boolean, default: false },
  showOnResources: { type: Boolean, default: true },
  trackClicks: { type: Boolean, default: true },
  slug: { type: String, unique: true, sparse: true },
  clickCount: { type: Number, default: 0 },
  lastCheckedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Backlink', backlinkSchema);
