const mongoose = require("mongoose");

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
