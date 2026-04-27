const mongoose = require("mongoose");
// Define the ApprovalLog schema to track all approval actions taken on payments
const approvalLogSchema = new mongoose.Schema(
  {
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
    action: String,
    performedBy: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("ApprovalLog", approvalLogSchema);