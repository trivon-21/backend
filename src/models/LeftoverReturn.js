const mongoose = require('mongoose');

const LeftoverReturnSchema = new mongoose.Schema({
  returnId: { type: String, required: true, unique: true },
  jobId: { type: String, required: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
  itemName: { type: String, required: true },
  itemSku: { type: String },
  quantityReturned: { type: Number, required: true, min: 1 },
  condition: { type: String, enum: ['good', 'damaged', 'scrap'], required: true },
  returnedBy: { type: String, required: true },
  notes: { type: String, default: '' },
  restoredToStock: { type: Boolean, default: false },
  movedToQuarantine: { type: Boolean, default: false },
}, { 
  timestamps: true,
  collection: 'leftover_returns'
});

module.exports = mongoose.model('LeftoverReturn', LeftoverReturnSchema);
