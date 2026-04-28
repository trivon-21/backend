const mongoose = require('mongoose');

const MaterialItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  qty: { type: Number, required: true },
  confirmed: { type: Boolean, default: false },
  sku: { type: String, required: true }
}, { _id: false });

const MaterialRequestSchema = new mongoose.Schema({
  requestId: { type: String, required: true, unique: true },
  requester: { type: String, required: true },
  date: { type: String, required: true },
  location: { type: String, required: true },
  status: { type: String, enum: ['pending', 'reserved', 'completed'], default: 'pending' },
  items: [MaterialItemSchema],
  serviceTeam: { type: String },
  completedAt: { type: String },
  lastMovedAt: { type: Date }
}, { 
  timestamps: true,
  collection: 'material_requests'
});

module.exports = mongoose.model('MaterialRequest', MaterialRequestSchema);
