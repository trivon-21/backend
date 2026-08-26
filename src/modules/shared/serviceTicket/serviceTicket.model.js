const mongoose = require('mongoose');
const { Schema } = mongoose;

const serviceTicketSchema = new Schema(
  {
    
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestType: { type: String, enum: ['Maintenance', 'Repair', 'Installation', 'Inspection'], default: 'Repair' },
    description: { type: String, required: true },

    
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    serviceType: { type: String },
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
    status: { type: String, default: 'New', enum: ['New', 'Reviewed', 'Assigned', 'open', 'in-progress', 'resolved', 'escalated', 'Rejected'] },
    acUnitModel: { type: String, default: '' },
    acUnitSerial: { type: String, default: '' },
    preferredDate: { type: Date },
    preferredTimeSlot: { type: String, default: '' },
    assignedTechnicianId: { type: Schema.Types.ObjectId, ref: 'User' },
    slaDueAt: Date,
    resolvedAt: Date,
  },
  { timestamps: true, collection: 'service_tickets' }
);

// Auto-clear resolvedAt if ticket leaves the resolved state
serviceTicketSchema.pre('save', function () {
  if (this.isModified('status')) {
    if (this.status === 'resolved' && !this.resolvedAt) this.resolvedAt = new Date();
    if (this.status !== 'resolved') this.resolvedAt = undefined;
  }
});

module.exports = mongoose.models.ServiceTicket || mongoose.model('ServiceTicket', serviceTicketSchema);
