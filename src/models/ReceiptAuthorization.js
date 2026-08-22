const mongoose = require('mongoose');
const { NON_PO_REASONS } = require('../utils/purchase-workflow');

const ReceiptAuthorizationSchema = new mongoose.Schema({
  authorizationNumber: { type: String, required: true, unique: true },
  receiptMode: { type: String, enum: ['NON_PO'], default: 'NON_PO', immutable: true },
  nonPoReason: { type: String, enum: NON_PO_REASONS, required: true },
  explanation: { type: String, required: true, trim: true },
  inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManagerInventoryItem' },
  newItemSnapshot: { type: mongoose.Schema.Types.Mixed, immutable: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  supplierName: { type: String, required: true },
  authorizedQuantity: { type: Number, required: true, min: 1 },
  receivedQuantity: { type: Number, default: 0, min: 0 },
  unitCost: { type: Number, default: 0, min: 0 },
  estimatedTotal: { type: Number, default: 0, min: 0 },
  affectedWorkType: {
    type: String,
    enum: ['REPAIR', 'INSTALLATION', 'MAINTENANCE', 'INSPECTION', 'TICKET', 'OTHER', 'NONE'],
    default: 'NONE',
  },
  affectedWorkId: { type: String, default: '' },
  affectedWorkReference: { type: String, default: '' },
  sourceDocumentNumber: { type: String, required: true, trim: true },
  supportingDocumentUrl: { type: String, default: '', trim: true },
  requestedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedByName: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'partially-received', 'completed'],
    default: 'pending',
  },
  approvedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedByName: { type: String, default: '' },
  approvedAt: { type: Date },
  approvalComment: { type: String, default: '' },
  rejectedAt: { type: Date },
  rejectionReason: { type: String, default: '' },
  financeReviewStatus: {
    type: String,
    enum: ['not-required', 'pending', 'reconciled', 'rejected'],
    default: 'pending',
  },
  financeReviewedAt: { type: Date },
  financeReviewedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  financeReference: { type: String, default: '' },
  financeComment: { type: String, default: '' },
  statusVersion: { type: Number, default: 0, min: 0 },
}, {
  timestamps: true,
  collection: 'receipt_authorizations',
  optimisticConcurrency: true,
});

ReceiptAuthorizationSchema.index({ supplierId: 1, sourceDocumentNumber: 1 }, { unique: true });

ReceiptAuthorizationSchema.pre('validate', function validateAuthorizationReferences() {
  if (!this.inventoryId && !this.newItemSnapshot) {
    this.invalidate('inventoryId', 'An inventory item or new-item snapshot is required');
  }
  if (!Number.isInteger(this.authorizedQuantity) || !Number.isInteger(this.receivedQuantity)) {
    this.invalidate('receivedQuantity', 'Authorization quantities must be whole numbers');
  }
  if (Number(this.receivedQuantity || 0) > Number(this.authorizedQuantity || 0)) {
    this.invalidate('receivedQuantity', 'Received quantity cannot exceed authorized quantity');
  }
});

module.exports = mongoose.model('ReceiptAuthorization', ReceiptAuthorizationSchema);
