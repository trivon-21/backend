const mongoose = require('mongoose');

const OrderRequestItemSchema = new mongoose.Schema({
  inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
  name: { type: String, required: true },
  sku: { type: String, required: true },
  quantity: { type: Number, required: true },
  unitCost: { type: Number, default: 0 },
  estimatedTotal: { type: Number, default: 0 }
}, { _id: false });

const OrderRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  items: [OrderRequestItemSchema],
  supplierName: { type: String, required: true },
  totalEstimate: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['pending-approval', 'approved', 'rejected'], 
    default: 'pending-approval' 
  },
  requestedBy: { type: String, required: true },
  priority: { type: String, enum: ['normal', 'urgent'], default: 'normal' },
  notes: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },
  approvedBy: { type: String, default: '' },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  source: { type: String, enum: ['manual', 'low-stock'], default: 'manual' }
}, { 
  timestamps: true,
  collection: 'order_requests'
});

module.exports = mongoose.model('OrderRequest', OrderRequestSchema);
