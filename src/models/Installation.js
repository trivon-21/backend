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

module.exports = mongoose.models.Installation
  || mongoose.model('Installation', InstallationSchema);
