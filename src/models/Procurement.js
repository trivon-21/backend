const mongoose = require('mongoose');

const ProcurementSchema = new mongoose.Schema({
  inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
  invoiceNumber: { type: String, required: true },
  poNumber: { type: String },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName: { type: String, required: true },
  itemName: { type: String, required: true },
  sku: { type: String, required: true },
  itemClass: { type: String, default: 'Unclassified' },
  subcategory: { type: String, default: 'Unclassified' },
  brand: { type: String, default: '' },
  quantity: { type: Number, required: true },
  unit: { type: String, required: true },
  unitCost: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  binLocation: { type: String, default: '' },
  receivedBy: { type: String, required: true },
  receivedDate: { type: Date, default: Date.now },
  condition: { type: String, enum: ['Good', 'Damaged', 'Incomplete'], default: 'Good' },
  timestamp: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  collection: 'procurements'
});

module.exports = mongoose.model('Procurement', ProcurementSchema);
