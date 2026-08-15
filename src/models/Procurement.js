const mongoose = require('mongoose');
const { NON_PO_REASONS } = require('../utils/purchase-workflow');

const ProcurementSchema = new mongoose.Schema({
  inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
  receiptMode: { type: String, enum: ['PO', 'NON_PO', 'LEGACY'], default: 'LEGACY' },
  invoiceNumber: { type: String, default: '' },
  poNumber: { type: String },
  orderRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderRequest' },
  orderLineId: { type: String, default: '' },
  receiptAuthorizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReceiptAuthorization' },
  nonPoReason: { type: String, enum: ['', ...NON_PO_REASONS], default: '' },
  sourceDocumentNumber: { type: String, default: '' },
  sourceDocumentKey: { type: String, index: true },
  receiptEventId: { type: String, unique: true, sparse: true },
  supportingDocumentUrl: { type: String, default: '' },
  affectedWorkReference: { type: String, default: '' },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  supplierName: { type: String, required: true },
  itemName: { type: String, required: true },
  sku: { type: String, required: true },
  itemClass: { type: String, default: 'Unclassified' },
  subcategory: { type: String, default: 'Unclassified' },
  brand: { type: String, default: '' },
  quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
  unit: { type: String, required: true },
  unitCost: { type: Number, default: 0, min: 0 },
  totalCost: { type: Number, default: 0, min: 0 },
  binLocation: { type: String, default: '' },
  receivedBy: { type: String, required: true },
  receivedDate: { type: Date, default: Date.now },
  condition: { type: String, enum: ['Good', 'Damaged', 'Incomplete'], default: 'Good' },
  timestamp: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  collection: 'procurements'
});

ProcurementSchema.pre('validate', function validateReceiptReference() {
  if (this.receiptMode === 'PO' && (!this.orderRequestId || !this.orderLineId)) {
    this.invalidate('orderRequestId', 'PO receipts require an order request and order line');
  }
  if (this.receiptMode === 'NON_PO' && !this.receiptAuthorizationId) {
    this.invalidate('receiptAuthorizationId', 'Non-PO receipts require an approved authorization');
  }
});

module.exports = mongoose.model('Procurement', ProcurementSchema);
