const mongoose = require('mongoose');
const { NON_PO_REASONS } = require('../utils/purchase-workflow');

const ProcurementSchema = new mongoose.Schema({
  inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManagerInventoryItem' },
  receiptMode: { type: String, enum: ['PO', 'NON_PO', 'LEGACY'], default: 'LEGACY' },
  invoiceNumber: { type: String, default: '' },
  poNumber: { type: String },
  orderRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManagerInventoryPurchaseRequest' },
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
  acceptedQuantity: { type: Number, min: 0, validate: Number.isInteger },
  damagedQuantity: { type: Number, min: 0, validate: Number.isInteger },
  missingQuantity: { type: Number, min: 0, validate: Number.isInteger },
  acceptedTotalCost: { type: Number, min: 0 },
  disputedTotalCost: { type: Number, min: 0 },
  discrepancyId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReceiptDiscrepancy' },
  replacementForDiscrepancyId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReceiptDiscrepancy' },
  damagedSerialNumbers: { type: [String], default: undefined },
  unit: { type: String, required: true },
  unitCost: { type: Number, default: 0, min: 0 },
  totalCost: { type: Number, default: 0, min: 0 },
  location: { type: String, default: '' },
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
  const hasBreakdown = [this.acceptedQuantity, this.damagedQuantity, this.missingQuantity]
    .some((value) => value !== undefined && value !== null);
  if (hasBreakdown) {
    const accepted = Number(this.acceptedQuantity || 0);
    const damaged = Number(this.damagedQuantity || 0);
    const missing = Number(this.missingQuantity || 0);
    if (accepted + damaged + missing !== Number(this.quantity)) {
      this.invalidate('quantity', 'Receipt breakdown must equal expected quantity');
    }
  }
});

module.exports = mongoose.model('Procurement', ProcurementSchema);
