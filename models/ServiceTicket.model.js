const mongoose = require("mongoose");

const serviceTicketSchema = new mongoose.Schema(
  {
    customerId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    orderId:         { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    serviceType:     { type: String, enum: ["REPAIR", "MAINTENANCE"], required: true },
    description:     { type: String, default: "" },
    serviceFee:      { type: Number, default: 0 },
    paymentStatus:   {
      type: String,
      enum: ["PENDING_PAYMENT", "UNDER_REVIEW", "APPROVED", "REJECTED"],
      default: "PENDING_PAYMENT"
    },
    paymentSlipUrl:  { type: String, default: null },
    rejectionReason: { type: String, default: null },
    slipUploadedAt:  { type: Date, default: null },
    approvedAt:      { type: Date, default: null },
    rejectedAt:      { type: Date, default: null },
  },
  { strict: false, timestamps: true }
);

module.exports = mongoose.model("ServiceTicket", serviceTicketSchema);