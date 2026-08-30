const mongoose = require('mongoose');

const ServiceTicketSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestType: { type: String, enum: ['Maintenance', 'Repair'], required: true },
  description: { type: String, required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  serviceType: { type: String, enum: ['REPAIR', 'MAINTENANCE'] },
  serviceFee: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['NEW', 'PENDING_PAYMENT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] },
  paymentSlipUrl: { type: String },
  rejectionReason: { type: String },
  slipUploadedAt: { type: Date },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  subject: { type: String },
  category: { type: String, enum: ['installation', 'repair', 'maintenance', 'inspection'], default: 'repair' },
  priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  status: {
    type: String,
    enum: [
      'New', 'Reviewed', 'Assigned', 'In Progress', 'Completed', 'Closed', 'Cancelled',
      'open', 'in-progress', 'resolved', 'escalated', 'Rejected',
    ],
    default: 'New',
  },
  assignedTechnicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  slaDueAt: { type: Date },
  resolvedAt: { type: Date },
}, {
  timestamps: true,
  collection: 'service_tickets',
  optimisticConcurrency: true,
});

ServiceTicketSchema.pre('validate', function synchronizeResolutionTimestamp() {
  if (this.status === 'resolved' && !this.resolvedAt) this.resolvedAt = new Date();
  if (this.status !== 'resolved' && this.resolvedAt) this.resolvedAt = undefined;
});

module.exports = mongoose.models.ManagerServiceTicket
  || mongoose.model('ManagerServiceTicket', ServiceTicketSchema);
