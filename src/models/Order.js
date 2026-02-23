const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const orderSchema = new mongoose.Schema(
  {
    orderRef: {
      type: String,
      unique: true,
      default: () => "ORD-" + uuidv4().split("-")[0].toUpperCase()
    },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    itemName: { type: String, required: true, trim: true },
    productImage: { type: String, default: "" },
    quantity: { type: Number, default: 1 },
    amount: { type: Number, required: true },

    // Legacy status kept for dashboard backward-compat
    status: {
      type: String,
      enum: ["Completed", "Pending", "Returned"],
      default: "Pending"
    },

    paymentStatus: {
      type: String,
      enum: ["Pending Payment", "Under Review", "Confirmed", "Rejected"],
      default: "Pending Payment"
    },

    orderType: {
      type: String,
      enum: ["Buy Only", "Buy & Install"],
      default: "Buy Only"
    },

    orderStatus: {
      type: String,
      enum: [
        "Order Placed",
        "Payment Uploaded",
        "Payment Confirmed",
        "Inventory Approved",
        "Shipped",
        "Delivered",
        "Installation Scheduled",
        "Installation Completed"
      ],
      default: "Order Placed"
    },

    deliveryTrackingId: { type: String, default: "" },
    deliveryPartnerUrl: { type: String, default: "" },

    warrantyStart: { type: Date },
    warrantyExpiry: { type: Date },
    amcStatus: {
      type: String,
      enum: ["Active", "Expired", "Not Available"],
      default: "Not Available"
    },

    paymentSlipUrl: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
