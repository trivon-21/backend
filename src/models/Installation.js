const mongoose = require('mongoose');

const InstallationSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallationOrder' },
  inspectionTicketId: { type: mongoose.Schema.Types.ObjectId, ref: 'InspectionTicket' },
  assignedTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'TechTeam' },
  assignedTeamName: { type: String },
  location: { type: String },
  productType: { type: String },
  serviceDate: { type: Date },
  status: { type: String, enum: ['Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled'], default: 'Pending' },
}, {
  timestamps: true,
  collection: 'installations',
  strict: false,
});

// Supports the manager work-item read model (status filtering + createdAt order).
InstallationSchema.index({ status: 1 });
InstallationSchema.index({ createdAt: -1 });

module.exports = mongoose.models.ManagerInstallation
  || mongoose.model('ManagerInstallation', InstallationSchema);
