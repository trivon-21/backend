const mongoose = require('mongoose');

const RmaCaseSchema = new mongoose.Schema({
  rmaId: { type: String, required: true, unique: true },
  inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManagerInventoryItem' },
  serializedAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'SerializedAsset', index: true },
  serialNumber: { type: String, required: true },
  itemName: { type: String },
  itemSku: { type: String },
  faultDescription: { type: String, required: true },
  reportedBy: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['reported', 'under-review', 'sent-to-supplier', 'replacement-pending', 'resolved', 'closed'], 
    default: 'reported' 
  },
  type: { type: String, enum: ['Single', 'Kit', 'Bundle'], default: 'Single' },
  resolutionType: { 
    type: String, 
    enum: ['internal-repair', 'supplier-replacement', ''], 
    default: '' 
  },
  resolutionNote: { type: String, default: '' },
  resolution: { type: String, default: '' },
  resolvedAt: { type: Date },
  replacementSerializedAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'SerializedAsset' },
}, { 
  timestamps: true,
  collection: 'rma_cases'
});

RmaCaseSchema.index({ status: 1 });
RmaCaseSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RmaCase', RmaCaseSchema);
