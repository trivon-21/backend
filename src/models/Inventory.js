const mongoose = require('mongoose');

const InventorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  type: { type: String, enum: ['Single', 'Bundle'], default: 'Single' },
  category: { type: String, required: true },
  available: { type: Number, default: 0 },
  reserved: { type: Number, default: 0 },
  location: { type: String, default: 'Warehouse' },
  unit: { type: String, default: 'units' },
  reorderLevel: { type: Number, default: 10 },
  status: { type: String, enum: ['critical', 'warning', 'normal'], default: 'normal' },
}, { 
  timestamps: true,
  collection: 'inventory' // Ensuring singular/specific naming as per previous instructions
});

module.exports = mongoose.model('Inventory', InventorySchema);
