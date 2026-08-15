const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const orderSchema = new mongoose.Schema(
  {
    // Ours
    orderRef: {
      type: String,
      unique: true,
      default: () => "ORD-" + uuidv4().split("-")[0].toUpperCase()
    },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
    itemName: { type: String, required: false, trim: true },
    productImage: { type: String, default: "" },
    quantity: { type: Number, default: 1 },
    amount: { type: Number, required: false },

    // Combined status
    status: {
      type: String,
      enum: ["Completed", "Pending", "Returned", "Pending Payment", "Under Review (Finance)", "Confirmed", "Cancelled", "Pending Review"],
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

    paymentSlipUrl: { type: String, default: "" },

    // Theirs
    orderReference: {
      type: String,
      unique: false
    },
    orderId: {
      type: String,
      unique: false
    },
    userId: {
      type: String,
      required: false
    },
    items: [
      {
        productId: { type: String, required: false },
        name: { type: String, required: false },
        price: { type: Number, required: false },
        quantity: { type: Number, required: false, min: 1 },
        purchaseType: {
          type: String,
          enum: ['buy_only', 'buy_and_install'],
          default: 'buy_only'
        }
      }
    ],
    shippingDetails: {
      firstName: { type: String, default: '' },
      lastName: { type: String, default: '' },
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      address: { type: String, default: '' },
      city: { type: String, default: '' },
      postalCode: { type: String, default: '' }
    },
    subtotal: { type: Number, required: false },
    additionalCharges: { type: Number, default: 0 },
    total: { type: Number, required: false },
    paymentSlip: { type: String }, // From submitPayment (relative file path)
    consultationCompleted: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);
