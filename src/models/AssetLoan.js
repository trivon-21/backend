const mongoose = require('mongoose');

const AssetLoanSchema = new mongoose.Schema({
  toolId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  toolName: { type: String, required: true, trim: true },
  assetTag: { type: String, required: true, unique: true, trim: true },
  technicianId: { type: String, required: true },
  technicianUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  technicianName: { type: String, required: true, trim: true },
  checkedOutAt: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
}, { 
  timestamps: true,
  collection: 'asset_loans'
});

module.exports = mongoose.model('AssetLoan', AssetLoanSchema);
