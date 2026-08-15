const mongoose = require("mongoose");

const financeReviewSchema = new mongoose.Schema(
  {
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    reviewedBy: String,
    action: String,
    comment: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("FinanceReview", financeReviewSchema);