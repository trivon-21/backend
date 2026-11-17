const mongoose = require('mongoose');

const AssetReturnLogSchema = new mongoose.Schema({
  toolName: { type: String, required: true },
  assetTag: { type: String, required: true },
  technicianName: { type: String, required: true },
  checkedOutAt: { type: Date, required: true },
  returnedAt: { type: Date, default: Date.now },
}, { 
  timestamps: true,
  collection: 'asset_return_logs'
});

// TTL Index: Automatically delete documents after 14 days (1209600 seconds)
AssetReturnLogSchema.index({ returnedAt: 1 }, { expireAfterSeconds: 1209600 });

module.exports = mongoose.model('AssetReturnLog', AssetReturnLogSchema);
