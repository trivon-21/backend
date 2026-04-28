const mongoose = require('mongoose');

const AssetLoanSchema = new mongoose.Schema({
  toolId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  toolName: { type: String, required: true },
  assetTag: { type: String, required: true },
  technicianId: { type: String, required: true },
  technicianName: { type: String, required: true },
  checkedOutAt: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
}, { 
  timestamps: true,
  collection: 'asset_loans'
});

module.exports = mongoose.model('AssetLoan', AssetLoanSchema);
