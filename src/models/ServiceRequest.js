const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const serviceRequestSchema = new mongoose.Schema(
  {
    serviceRequestRef: {
      type: String,
      unique: true,
      default: () => "SRQ-" + uuidv4().split("-")[0].toUpperCase()
    },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // AC Unit details
    acUnitModel: { type: String, trim: true, default: "" },
    acUnitSerial: { type: String, trim: true, default: "" },
    acWarrantyStatus: {
      type: String,
      enum: ["Active", "Expired", "Unknown"],
      default: "Unknown"
    },
    acAmcStatus: {
      type: String,
      enum: ["Active", "Not Active"],
      default: "Not Active"
    },

    serviceType: {
      type: String,
      enum: ["Repair", "General Service", "Gas Refill", "Installation Issue", "AMC Service", "Other"],
      required: true
    },
    serviceTypeOther: { type: String, default: "" },
    problemDescription: { type: String, trim: true, default: "" },
    problemImageUrl: { type: String, default: "" },

    preferredDate: { type: Date },
    preferredTimeSlot: { type: String, default: "" },

    estimatedCharges: { type: Number, default: 0 },
    paymentRequired: { type: Boolean, default: false },

    // subject kept for backward compat
    subject: { type: String, trim: true, default: "" },

    status: {
      type: String,
      enum: ["Pending", "Assigned", "In Progress", "Completed", "Cancelled"],
      default: "Pending"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ServiceRequest", serviceRequestSchema);
