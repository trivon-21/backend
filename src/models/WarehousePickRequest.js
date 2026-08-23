const mongoose = require('mongoose');

const WarehousePickItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  qty: { type: Number, required: true, min: 1, validate: Number.isInteger },
  confirmed: { type: Boolean, default: false },
  sku: { type: String, required: true },
}, { _id: false });

const WarehousePickRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  requester: { type: String, required: true },
  date: { type: String, required: true },
  location: { type: String, required: true },
  status: { type: String, enum: ['pending', 'reserved', 'completed'], default: 'pending' },
  items: [WarehousePickItemSchema],
  serviceTeam: { type: String },
  completedAt: { type: String },
  lastMovedAt: { type: Date },
}, {
  timestamps: true,
  collection: 'warehouse_pick_requests',
});

module.exports = mongoose.models.WarehousePickRequest
  || mongoose.model('WarehousePickRequest', WarehousePickRequestSchema);
