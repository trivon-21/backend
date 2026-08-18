const mongoose = require('mongoose');
const { Schema } = mongoose;

const inspectionTicketSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'InstallationOrder', required: true }, // ref target is catalog's InstallationOrder/Order
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      default: 'PENDING_PAYMENT',
      enum: ['PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'PAYMENT_CONFIRMED', 'PAYMENT_REJECTED', 'INSPECTION_SCHEDULED', 'ONGOING', 'REPORT_RECORDED', 'INSPECTED'],
    },
    inspectionFee: { type: Number, default: 5000 },
    slipUrl: String,
    rejectionReason: String,
    scheduledDate: Date,
    slipUploadedAt: Date,
    approvedAt: Date,
    rejectedAt: Date,
    scheduledAt: Date,
    startedAt: Date,
    inspectedAt: Date,
    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'inspectiontickets' }
);

module.exports = mongoose.model('InspectionTicket', inspectionTicketSchema);