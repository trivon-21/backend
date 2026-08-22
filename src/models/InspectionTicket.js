const mongoose = require('mongoose');

const InspectionTicketSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallationOrder', required: true },
  inspectionFee: { type: Number, default: 5000 },
  status: {
    type: String,
    enum: [
      'PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'PAYMENT_CONFIRMED', 'PAYMENT_REJECTED',
      'INSPECTION_SCHEDULED', 'ONGOING', 'REPORT_RECORDED', 'INSPECTED',
    ],
    default: 'PENDING_PAYMENT',
  },
  scheduledDate: { type: Date },
  scheduledAt: { type: Date },
  startedAt: { type: Date },
  inspectedAt: { type: Date },
  slipUrl: { type: String },
  slipUploadedAt: { type: Date },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  rejectionReason: { type: String },
  reminderSent: { type: Boolean, default: false },
}, {
  timestamps: true,
  collection: 'inspectiontickets',
});

module.exports = mongoose.models.ManagerInspectionTicket
  || mongoose.model('ManagerInspectionTicket', InspectionTicketSchema);
