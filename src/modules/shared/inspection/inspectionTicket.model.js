const mongoose = require('mongoose');
const { Schema } = mongoose;

const inspectionTicketSchema = new Schema(
  {
    ticketRef: { type: String, unique: true, sparse: true },
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
  { timestamps: true, collection: 'inspection_tickets' }
);

inspectionTicketSchema.pre("save", async function () {
  if (!this.ticketRef) {
    const Model = mongoose.model("InspectionTicket");
    let attempt = 0;
    let candidate;
    let exists = true;
    while (exists && attempt < 20) {
      const count = await Model.countDocuments();
      candidate = `INS-${String(count + 1 + attempt).padStart(5, "0")}`;
      exists = await Model.exists({ ticketRef: candidate });
      attempt++;
    }
    this.ticketRef = candidate;
  }
});

module.exports = mongoose.models.InspectionTicket || mongoose.model('InspectionTicket', inspectionTicketSchema);