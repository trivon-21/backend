const mongoose = require('mongoose');

const AssetLoanSchema = new mongoose.Schema({
  toolId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManagerInventoryItem', required: true },
  toolName: { type: String, required: true, trim: true },
  assetTag: { type: String, required: true, unique: true, trim: true },
  technicianId: { type: String, required: true },
  technicianUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  technicianName: { type: String, required: true, trim: true },
  checkedOutAt: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ['on-loan', 'returned'], default: 'on-loan' },
  returnedAt: { type: Date },
  condition: { type: String, enum: ['good', 'damaged', 'incomplete'], default: 'good' },
}, { 
  timestamps: true,
  collection: 'asset_loans'
});

AssetLoanSchema.pre('validate', function synchronizeReturnState() {
  if (this.status === 'returned' && !this.returnedAt) this.returnedAt = new Date();
  if (this.status === 'on-loan') this.returnedAt = undefined;
});

module.exports = mongoose.model('AssetLoan', AssetLoanSchema);
