const mongoose = require("mongoose");

const purchaseItemSchema = new mongoose.Schema({
  itemName:  String,
  quantity:  Number,
  unitPrice: Number,
  total:     Number,
  // team fields (keep for compatibility)
  inventoryId: mongoose.Schema.Types.ObjectId,
  name:        String,
  unitCost:    Number,
  estimatedTotal: Number,
}, { strict: false });

const purchaseRequestSchema = new mongoose.Schema({
  requestId:        String,
  requestedBy:      String,
  requestedById:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  requestedByEmail: String,
  supplierName:     String,
  supplierId:       { type: mongoose.Schema.Types.ObjectId },
  items:            [purchaseItemSchema],
  totalAmount:      { type: Number, default: 0 },   // your field
  totalEstimate:    { type: Number, default: 0 },   // team field
  reason:           String,
  notes:            String,
  priority:         String,
  rejectionReason:  String,
  approvedBy:       String,
  approvedAt:       Date,
  rejectedAt:       Date,
  reviewedBy:       String,
  status: {
    type: String,
    // team uses: pending-manager, approved, rejected
    // your code uses: PENDING, APPROVED, REJECTED
    enum: ["pending-manager", "PENDING", "APPROVED", "REJECTED",
           "approved", "rejected", "pending-finance"],
    default: "pending-manager",
  },
  statusVersion:   { type: Number, default: 0 },
  source:          { type: String, default: "manual" },
  decisionHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true, strict: false });

const PurchaseRequest = mongoose.models.PurchaseRequest
  || mongoose.model("PurchaseRequest", purchaseRequestSchema, "purchase_requests");

if (!mongoose.models.L_PurchaseRequest) {
  mongoose.model("L_PurchaseRequest", purchaseRequestSchema, "purchase_requests");
}

module.exports = PurchaseRequest;