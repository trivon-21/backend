const mongoose = require("mongoose");
// Define the AuditLog schema to capture all relevant details of payment and invoice events
const auditLogSchema = new mongoose.Schema(
  {
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
      ],
      required: true,
    },
    // Type of payment or invoice (for easier filtering and stats)
    paymentType: {
      type: String,
      enum: ["BUY_ONLY", "INSPECTION", "INVOICE", "REPAIR", "MAINTENANCE"],
      required: true,
    },
    // References to related entities (if applicable)
    orderId: { type: String, default: null },
    ticketId: { type: String, default: null },
    invoiceId: { type: String, default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    customerName: { type: String, default: "Unknown" },
    customerEmail: { type: String, default: "" },
    amount: { type: Number, default: 0 },
    rejectionReason: { type: String, default: null },
    slipUrl: { type: String, default: null },
    performedBy: { type: String, default: "Finance Officer" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);