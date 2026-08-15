const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const { PURCHASE_STATUSES, LEGACY_PURCHASE_STATUSES } = require('../utils/purchase-workflow');

const DecisionSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'not-required'], default: 'pending' },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: { type: String, default: '' },
  comment: { type: String, default: '' },
  decidedAt: { type: Date },
}, { _id: false });

const DecisionHistorySchema = new mongoose.Schema({
  stage: { type: String, enum: ['manager', 'finance', 'fulfillment', 'migration'], required: true },
  decision: { type: String, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: { type: String, default: '' },
  comment: { type: String, default: '' },
  at: { type: Date, default: Date.now },
}, { _id: false });

const OrderRequestItemSchema = new mongoose.Schema({
  lineId: { type: String, default: () => randomUUID() },
  inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
  name: { type: String, required: true },
  sku: { type: String, required: true },
  itemClass: { type: String, default: 'Unclassified' },
  subcategory: { type: String, default: 'Unclassified' },
  unit: { type: String, default: 'units' },
  manufacturerPartNumber: { type: String, default: '' },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  quantity: { type: Number, required: true },
  orderedQuantity: { type: Number, min: 0 },
  receivedQuantity: { type: Number, default: 0, min: 0 },
  unitCost: { type: Number, default: 0 },
  estimatedTotal: { type: Number, default: 0 }
}, { _id: false });

const OrderRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  items: [OrderRequestItemSchema],
  supplierName: { type: String, required: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  totalEstimate: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: [...PURCHASE_STATUSES, ...LEGACY_PURCHASE_STATUSES],
    default: 'draft' 
  },
  requestedBy: { type: String, required: true },
  requestedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  priority: { type: String, enum: ['normal', 'urgent'], default: 'normal' },
  notes: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },
  approvedBy: { type: String, default: '' },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  operationalApproval: { type: DecisionSchema, default: () => ({ status: 'pending' }) },
  financialApproval: { type: DecisionSchema, default: () => ({ status: 'pending' }) },
  decisionHistory: { type: [DecisionHistorySchema], default: [] },
  poNumber: { type: String, unique: true, sparse: true },
  orderedAt: { type: Date },
  statusVersion: { type: Number, default: 0, min: 0 },
  sourceLegacyId: { type: String, unique: true, sparse: true },
  legacyReadOnly: { type: Boolean, default: false },
  source: { type: String, enum: ['manual', 'low-stock'], default: 'manual' }
}, { 
  timestamps: true,
  collection: 'order_requests',
  optimisticConcurrency: true,
});

OrderRequestSchema.pre('validate', function normalizeLines() {
  for (const item of this.items || []) {
    if (!item.lineId) item.lineId = randomUUID();
    if (item.orderedQuantity === undefined || item.orderedQuantity === null) {
      item.orderedQuantity = item.quantity;
    }
  }
});

module.exports = mongoose.model('OrderRequest', OrderRequestSchema);
