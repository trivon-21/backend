const mongoose = require('mongoose');

const QuarantineItemSchema = new mongoose.Schema({
  quarantineId: { type: String, required: true, unique: true },
  itemName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unit: { type: String, default: 'units' },
  reason: { type: String, required: true },
  location: { type: String, default: '' },
  source: { type: String, enum: ['leftover-return', 'rma', 'manual'], default: 'manual' },
  sourceRefId: { type: String, default: '' },
  status: { 
    type: String, 
    enum: ['quarantined', 'disposed', 'returned-to-supplier'], 
    default: 'quarantined' 
  },
  disposedAt: { type: Date },
  disposedBy: { type: String },
}, { 
  timestamps: true,
  collection: 'quarantine_items'
});

module.exports = mongoose.model('QuarantineItem', QuarantineItemSchema);
