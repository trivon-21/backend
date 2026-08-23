const mongoose = require('mongoose');

const SupplierSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  contactPerson: { type: String },
  phone: { type: String },
  email: { type: String },
  address: { type: String },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { 
  timestamps: true,
  collection: 'suppliers'
});

module.exports = mongoose.model('Supplier', SupplierSchema);
