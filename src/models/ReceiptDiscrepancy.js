const mongoose = require('mongoose');

const ReceiptDiscrepancySchema = new mongoose.Schema({
  discrepancyId: { type: String, required: true, unique: true, trim: true },
  receiptEventId: { type: String, required: true, unique: true, trim: true },
  inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManagerInventoryItem', required: true },
  procurementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Procurement' },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  supplierName: { type: String, required: true, trim: true },
  itemName: { type: String, required: true, trim: true },
  sku: { type: String, required: true, trim: true },
  receiptMode: { type: String, enum: ['PO', 'NON_PO'], required: true },
  orderRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManagerInventoryPurchaseRequest' },
  orderLineId: { type: String, default: '' },
  receiptAuthorizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReceiptAuthorization' },
  sourceDocumentNumber: { type: String, required: true, trim: true },
  expectedQuantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
  acceptedQuantity: { type: Number, required: true, min: 0, validate: Number.isInteger },
  damagedQuantity: { type: Number, required: true, min: 0, validate: Number.isInteger },
  missingQuantity: { type: Number, required: true, min: 0, validate: Number.isInteger },
  outstandingQuantity: { type: Number, required: true, min: 0, validate: Number.isInteger },
  resolvedQuantity: { type: Number, default: 0, min: 0, validate: Number.isInteger },
  unit: { type: String, default: 'units' },
  unitCost: { type: Number, default: 0, min: 0 },
  disputedValue: { type: Number, default: 0, min: 0 },
  acceptedSerialNumbers: { type: [String], default: [] },
  damagedSerialNumbers: { type: [String], default: [] },
  status: {
    type: String,
    enum: ['open', 'supplier-contacted', 'replacement-pending', 'resolved', 'waived'],
    default: 'open',
  },
  replacementProcurementIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Procurement' }],
  reportedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reportedByName: { type: String, required: true, trim: true },
  resolvedAt: { type: Date },
}, {
  timestamps: true,
  collection: 'receipt_discrepancies',
});

ReceiptDiscrepancySchema.pre('validate', function validateQuantities() {
  const expected = Number(this.expectedQuantity || 0);
  const accepted = Number(this.acceptedQuantity || 0);
  const damaged = Number(this.damagedQuantity || 0);
  const missing = Number(this.missingQuantity || 0);
  if (accepted + damaged + missing !== expected) {
    this.invalidate('expectedQuantity', 'Receipt discrepancy breakdown must equal expected quantity');
  }
  if (damaged + missing <= 0) {
    this.invalidate('outstandingQuantity', 'A discrepancy requires damaged or missing quantity');
  }
  if (Number(this.outstandingQuantity || 0) + Number(this.resolvedQuantity || 0) !== damaged + missing) {
    this.invalidate('outstandingQuantity', 'Resolved and outstanding quantities must reconcile to the discrepancy');
  }
  if (this.receiptMode === 'PO' && (!this.orderRequestId || !this.orderLineId)) {
    this.invalidate('orderRequestId', 'PO discrepancies require an order and line');
  }
  if (this.receiptMode === 'NON_PO' && !this.receiptAuthorizationId) {
    this.invalidate('receiptAuthorizationId', 'Non-PO discrepancies require an authorization');
  }
});

module.exports = mongoose.models.ReceiptDiscrepancy
  || mongoose.model('ReceiptDiscrepancy', ReceiptDiscrepancySchema);
