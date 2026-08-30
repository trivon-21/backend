const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const JobMaterialLineSchema = new mongoose.Schema({
  lineId: { type: String, default: () => randomUUID() },
  inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManagerInventoryItem', required: true },
  sku: { type: String, required: true, trim: true },
  itemName: { type: String, required: true, trim: true },
  quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
  unitPrice: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
}, { _id: false });

const FinanceDecisionSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: { type: String, default: '' },
  reason: { type: String, default: '' },
  decidedAt: { type: Date },
}, { _id: false });

const JobMaterialRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
  jobType: { type: String, enum: ['Repair', 'Installation', 'Maintenance'], required: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requesterName: { type: String, required: true },
  notes: { type: String, default: '' },
  items: { type: [JobMaterialLineSchema], validate: value => Array.isArray(value) && value.length > 0 },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'], default: 'PENDING' },
  fulfillmentStatus: {
    type: String,
    enum: ['NOT_SENT', 'PENDING', 'RESERVED', 'HANDED_OVER', 'CANCELLED'],
    default: 'NOT_SENT',
  },
  financeDecision: { type: FinanceDecisionSchema, default: () => ({}) },
  warehousePickRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'WarehousePickRequest' },
  statusVersion: { type: Number, default: 0, min: 0 },
}, {
  timestamps: true,
  collection: 'job_material_requests',
  optimisticConcurrency: true,
});

JobMaterialRequestSchema.index({ jobType: 1, jobId: 1 }, { unique: true });
JobMaterialRequestSchema.index({ requestId: 1 }, {
  unique: true,
  partialFilterExpression: { requestId: { $type: 'string' } },
});

module.exports = mongoose.models.JobMaterialRequest
  || mongoose.model('JobMaterialRequest', JobMaterialRequestSchema);
