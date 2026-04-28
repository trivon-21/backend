const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  qty: { type: Number, required: true },
  confirmed: { type: Boolean, default: false },
  sku: { type: String, required: true }
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  customer: { type: String, required: true },
  date: { type: String, required: true },
  type: { type: String, required: true },
  status: { type: String, enum: ['to-pack', 'ready', 'in-transit', 'completed'], default: 'to-pack' },
  courier: { type: String },
  trackId: { type: String },
  items: [OrderItemSchema],
  completedAt: { type: String },
  lastMovedAt: { type: Date }
}, { 
  timestamps: true,
  collection: 'orders'
});

module.exports = mongoose.model('Order', OrderSchema);
