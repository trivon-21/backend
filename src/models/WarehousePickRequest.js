const mongoose = require('mongoose');

const WarehousePickItemSchema = new mongoose.Schema({
  lineId: { type: String, required: true },
  inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManagerInventoryItem', required: true },
  name: { type: String, required: true },
  qty: { type: Number, required: true, min: 1, validate: Number.isInteger },
  confirmed: { type: Boolean, default: false },
  sku: { type: String, required: true },
  returnedQty: { type: Number, default: 0, min: 0 },
}, { _id: false });

const WarehousePickRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  sourceMaterialRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobMaterialRequest', required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, required: true },
  jobType: { type: String, enum: ['Repair', 'Installation', 'Maintenance'], required: true },
  requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requester: { type: String, required: true },
  date: { type: String, required: true },
  location: { type: String, required: true },
  status: { type: String, enum: ['pending', 'reserved', 'completed', 'cancelled'], default: 'pending' },
  items: [WarehousePickItemSchema],
  assignedTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'TechTeam' },
  assignedTeamName: { type: String },
  completedAt: { type: String },
  lastMovedAt: { type: Date },
  statusVersion: { type: Number, default: 0, min: 0 },
}, {
  timestamps: true,
  collection: 'warehouse_pick_requests',
  optimisticConcurrency: true,
});

WarehousePickRequestSchema.index({ sourceMaterialRequestId: 1 }, {
  unique: true,
  partialFilterExpression: { sourceMaterialRequestId: { $type: 'objectId' } },
});

module.exports = mongoose.models.WarehousePickRequest
  || mongoose.model('WarehousePickRequest', WarehousePickRequestSchema);
