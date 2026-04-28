const mongoose = require('mongoose');

const ProcurementSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true },
  poNumber: { type: String },
  supplierName: { type: String, required: true },
  itemName: { type: String, required: true },
  sku: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },
  receivedBy: { type: String, required: true },
  receivedDate: { type: Date, default: Date.now },
  condition: { type: String, enum: ['Good', 'Damaged', 'Incomplete'], default: 'Good' },
  timestamp: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  collection: 'procurements'
});

module.exports = mongoose.model('Procurement', ProcurementSchema);
