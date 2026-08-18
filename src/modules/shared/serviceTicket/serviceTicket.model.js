const mongoose = require('mongoose');
const { Schema } = mongoose;

const serviceTicketSchema = new Schema(
  {
    
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestType: { type: String, enum: ['Maintenance', 'Repair'], required: true },
    description: { type: String, required: true },

    
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    serviceType: { type: String, enum: ['REPAIR', 'MAINTENANCE'] }, // may duplicate requestType during transition; reconcile in migration
    serviceFee: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['NEW','PENDING_PAYMENT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] },
    paymentSlipUrl: String,
    rejectionReason: String,
    slipUploadedAt: Date,
    approvedAt: Date,
    rejectedAt: Date,

    
    subject: String,
    category: { type: String, default: 'repair', enum: ['installation', 'repair', 'maintenance', 'inspection'] },
    priority: { type: String, default: 'medium', enum: ['high', 'medium', 'low'] },
    status: { type: String, default: 'New', enum: ['New', 'Reviewed', 'Assigned', 'open', 'in-progress', 'resolved', 'escalated', 'Rejected'] }, // union of both status vocabularies â normalize during migration
    assignedTechnicianId: { type: Schema.Types.ObjectId, ref: 'User' },
    slaDueAt: Date,
    resolvedAt: Date,
  },
  { timestamps: true, collection: 'service_tickets' }
);

// Auto-clear resolvedAt if ticket leaves the resolved state (mirrors Dassana's original hook)
serviceTicketSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    if (this.status === 'resolved' && !this.resolvedAt) this.resolvedAt = new Date();
    if (this.status !== 'resolved') this.resolvedAt = undefined;
  }
  next();
});

module.exports = mongoose.model('ServiceTicket', serviceTicketSchema);
