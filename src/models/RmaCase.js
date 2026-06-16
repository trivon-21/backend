const mongoose = require('mongoose');

const RmaCaseSchema = new mongoose.Schema({
  rmaId: { type: String, required: true, unique: true },
  serialNumber: { type: String, required: true },
  itemName: { type: String },
  itemSku: { type: String },
  faultDescription: { type: String, required: true },
  reportedBy: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['reported', 'under-review', 'sent-to-supplier', 'resolved', 'closed'], 
    default: 'reported' 
  },
  type: { type: String, enum: ['Single', 'Bundle'], default: 'Single' },
  resolution: { type: String, default: '' },
  resolvedAt: { type: Date },
}, { 
  timestamps: true,
  collection: 'rma_cases'
});

module.exports = mongoose.model('RmaCase', RmaCaseSchema);
