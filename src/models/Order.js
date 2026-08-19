const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const normalizeOrderCompatibility = (doc) => {
  if (!doc || typeof doc !== "object") return doc;

  if (!doc.customer && doc.userId) {
    doc.customer = doc.userId;
  }

  if (!doc.userId && doc.customer) {
    doc.userId = String(doc.customer);
  }

  if (!doc.orderType && Array.isArray(doc.items)) {
    const purchaseType = doc.items.find(item => item && item.purchaseType)?.purchaseType;
    if (purchaseType === "buy_only") doc.orderType = "Buy Only";
    if (purchaseType === "buy_and_install") doc.orderType = "Buy & Install";
  }

  if (!doc.paymentStatus && doc.status === "Under Review (Finance)") {
    doc.paymentStatus = "Under Review";
  }

  if (doc.paymentStatus === "Confirmed") {
    doc.paymentStatus = "Approved";
  }

  if (!doc.status && doc.paymentStatus === "Under Review") {
    doc.status = "Under Review (Finance)";
  }

  if (!doc.itemName && Array.isArray(doc.items) && doc.items[0]) {
    doc.itemName = doc.items[0].name || doc.items[0].itemName || "";
  }

  if (!doc.amount) {
    const totalValue = Number(doc.total ?? doc.subtotal ?? 0);
    if (totalValue > 0) {
      doc.amount = totalValue;
    } else if (Array.isArray(doc.items)) {
      const totalItemValue = doc.items.reduce((sum, item) => {
        const price = Number(item?.price || item?.unitPrice || 0);
        const qty = Number(item?.quantity || 1);
        return sum + (price * qty);
      }, 0);
      if (totalItemValue > 0) doc.amount = totalItemValue;
    }
  }

  return doc;
};

const normalizeOrderQueryCompatibility = (query = {}) => {
  const normalized = { ...query };

  if (normalized.customer && normalized.userId === undefined) {
    normalized.$or = [
      { customer: normalized.customer },
      { userId: String(normalized.customer) }
    ];
    delete normalized.customer;
  }

  if (normalized.orderType === "Buy Only") {
    const combined = Array.isArray(normalized.$or) ? [...normalized.$or] : [];
    combined.push({ orderType: "Buy Only" }, { "items.purchaseType": "buy_only" });
    normalized.$or = combined;
    delete normalized.orderType;
  }

  if (normalized.orderType === "Buy & Install") {
    const combined = Array.isArray(normalized.$or) ? [...normalized.$or] : [];
    combined.push({ orderType: "Buy & Install" }, { "items.purchaseType": "buy_and_install" });
    normalized.$or = combined;
    delete normalized.orderType;
  }

  if (normalized.paymentStatus === "Under Review") {
    const combined = Array.isArray(normalized.$or) ? [...normalized.$or] : [];
    combined.push({ paymentStatus: "Under Review" }, { status: "Under Review (Finance)" });
    normalized.$or = combined;
    delete normalized.paymentStatus;
  }

  if (normalized.paymentStatus === "Approved" || normalized.paymentStatus === "Confirmed") {
    const combined = Array.isArray(normalized.$or) ? [...normalized.$or] : [];
    combined.push({ paymentStatus: "Approved" }, { paymentStatus: "Confirmed" });
    normalized.$or = combined;
    delete normalized.paymentStatus;
  }

  return normalized;
};

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
      enum: ["Pending Payment", "Under Review", "Confirmed", "Approved", "Rejected"],
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

orderSchema.pre(["find", "findOne"], function () {
  if (this && this._conditions) {
    this._conditions = normalizeOrderQueryCompatibility(this._conditions);
  }
});

module.exports = mongoose.model("Order", orderSchema);
