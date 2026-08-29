const mongoose = require("mongoose");

const invoiceItemSchema = new mongoose.Schema({
  no: Number,
  itemName: String,
  description: String,
  qty: Number,
  rate: Number,
  amount: Number,
});

const invoiceSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: "InspectionTicket" },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: "InspectionReport" },
invoiceType: { type: String, enum: ["INSTALLATION", "REPAIR"], default: "INSTALLATION" },
repairId:    { type: mongoose.Schema.Types.ObjectId, ref: "L_Repair" },
    // Invoice details
    invoiceNumber: { type: String, unique: true },
    invoiceDate: { type: Date, default: Date.now },

    // Customer details
    customerName: String,
    customerEmail: String,
    customerAddress: String,

    // Items from main technician report
    items: [invoiceItemSchema],
    serviceCharge: { type: Number, default: 0 },
    subTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },

    // Status flow
    status: {
      type: String,
      enum: [
        "DRAFT",           // Finance officer created, not sent yet
        "SENT",            // Sent to customer
        "ACCEPTED",        // Customer accepted
        "REJECTED",        // Customer rejected
        "REJECTION_CANCELLED", // Customer cancelled rejection within 30 days
        "PAID",            // Payment verified
        "AUTO_CANCELLED",  // No payment within 2 weeks or rejection not cancelled in 30 days
      ],
      default: "DRAFT",
    },

    // Timestamps
    sentAt: Date,
    acceptedAt: Date,
    rejectedAt: Date,
    paidAt: Date,
    cancelledAt: Date,

    // Rejection
    rejectionReason: String,
    rejectionDeadline: Date, // 30 days from sentAt

    // Payment deadline (14 days from acceptedAt)
    paymentDeadline: Date,

    // Reminders sent flags
    rejectionReminderSent: { type: Boolean, default: false },
    paymentReminderSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Auto generate invoice number
invoiceSchema.pre("save", async function () {
  if (!this.invoiceNumber) {
    const Invoice = mongoose.model("Invoice");
    let attempt = 0;
    let candidateNumber;
    let exists = true;
    while (exists && attempt < 20) {
      const count = await Invoice.countDocuments();
      candidateNumber = `INV-${String(count + 1 + attempt).padStart(5, "0")}`;
      exists = await Invoice.exists({ invoiceNumber: candidateNumber });
      attempt++;
    }
    this.invoiceNumber = candidateNumber;
  }
});

module.exports = mongoose.model("Invoice", invoiceSchema, "invoices");