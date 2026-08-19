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

  /*
  {

  "orderReference": "ALX-BO-0001",

  "userId": {

    "$oid": "6a80d6e285647b31a66b7ec3"

  },

  "items": [

    {

      "productId": "6a80d6e385647b31a66b7edd",

      "name": "Airlux SplitCool 12000BTU",

      "price": 145000,

      "quantity": 1,

      "purchaseType": "buy_only"

    }

  ],

  "shippingDetails": {

    "firstName": "Nadeesha",

    "lastName": "Fernando",

    "email": "nadeesha@example.com",

    "phone": "+94770000002",

    "address": "45 Negombo Road",

    "city": "Negombo",

    "postalCode": "11500"

  },

  "subtotal": 145000,

  "additionalCharges": 0,

  "total": 145000,

  "status": "Payment Confirmed",

  "consultationCompleted": false,

  "createdAt": {

    "$date": "2026-08-15T21:15:15.316Z"

  },

  "updatedAt": {

    "$date": "2026-08-16T19:25:55.443Z"

  },

  "__v": 0

}*/