const mongoose = require("mongoose");

const purchaseItemSchema = new mongoose.Schema({
  itemName:  String,
  quantity:  Number,
  unitPrice: Number,
  total:     Number,
});

const purchaseRequestSchema = new mongoose.Schema({
  requestedBy:    String,   // inventory manager's name
  requestedById:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  requestedByEmail: String,
  items:          [purchaseItemSchema],
  totalAmount:    { type: Number, default: 0 },
  reason:         String,   // note/justification

  status: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED"],
    default: "PENDING",
  },

  rejectionReason: String,
  approvedAt:       Date,
  rejectedAt:       Date,
  reviewedBy:       String,  // Finance Officer name
}, { timestamps: true });

module.exports = mongoose.model("L_PurchaseRequest", purchaseRequestSchema);