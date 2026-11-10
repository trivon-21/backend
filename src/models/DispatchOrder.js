const mongoose = require('mongoose');

const DispatchItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  qty: { type: Number, required: true, min: 1, validate: Number.isInteger },
  confirmed: { type: Boolean, default: false },
  sku: { type: String, required: true },
}, { _id: false });

const DispatchOrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  sourceOrderId: { type: mongoose.Schema.Types.ObjectId },
  sourceOrderType: { type: String, enum: ['Order', 'InstallationOrder', 'PurchaseRequest'] },
  customer: { type: String, required: true },
  deliveryDetails: {
    address: { type: String },
    city: { type: String },
    postalCode: { type: String },
    phone: { type: String },
    email: { type: String },
  },
  date: { type: String, required: true },
  type: { type: String, required: true },
  status: { type: String, enum: ['to-pack', 'ready', 'in-transit', 'completed'], default: 'to-pack' },
  statusVersion: { type: Number, default: 0, min: 0 },
  courier: { type: String },
  trackId: { type: String },
  items: [DispatchItemSchema],
  completedAt: { type: Date },
  lastMovedAt: { type: Date },
}, {
  timestamps: true,
  collection: 'dispatch_orders',
});

DispatchOrderSchema.index({ createdAt: -1 });
DispatchOrderSchema.index({ status: 1 });

module.exports = mongoose.models.DispatchOrder
  || mongoose.model('DispatchOrder', DispatchOrderSchema);
