const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    itemName: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["Completed", "Pending", "Returned"],
      default: "Pending"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
