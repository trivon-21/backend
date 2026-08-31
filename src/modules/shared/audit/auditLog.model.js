const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  eventType: {
    type: String,
    enum: [
      "PAYMENT_SUBMITTED",
      "PAYMENT_APPROVED",
      "PAYMENT_REJECTED",
      "PAYMENT_RESUBMITTED",
      "INVOICE_GENERATED",
      "INVOICE_SENT",
      "INVOICE_ACCEPTED",
      "INVOICE_REJECTED",
      "INVOICE_REJECTION_CANCELLED",
      "INVOICE_PAID",
      "INVOICE_AUTO_CANCELLED",
      "SERVICE_PAYMENT_SUBMITTED",
      "SERVICE_PAYMENT_APPROVED",
      "SERVICE_PAYMENT_REJECTED",
      "PURCHASE_REQUEST_APPROVED",
      "PURCHASE_REQUEST_REJECTED",
      "UPDATE_BANK_DETAILS",
    ],
    required: true,
  },
  paymentType: {
    type: String,
    enum: ["BUY_ONLY", "INSPECTION", "INVOICE", "REPAIR", "MAINTENANCE", "PURCHASE_REQUEST"],
    required: true,
  },
  orderId:         { type: String,  default: null },
  ticketId:        { type: String,  default: null },
  invoiceId:       { type: String,  default: null },
  customerId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  customerName:    { type: String,  default: "Unknown" },
  customerEmail:   { type: String,  default: "" },
  amount:          { type: Number,  default: 0 },
  rejectionReason: { type: String,  default: null },
  slipUrl:         { type: String,  default: null },
  performedBy:     { type: String,  default: "Finance Officer" },
  notes:           { type: String,  default: "" },
}, { timestamps: true });

module.exports = mongoose.models.PaymentAuditLog
  || mongoose.model("PaymentAuditLog", auditLogSchema, "audit_logs");

