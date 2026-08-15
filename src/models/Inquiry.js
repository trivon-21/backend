const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const threadMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: String,
      enum: ["Customer", "Support"],
      required: true
    },
    message: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

const inquirySchema = new mongoose.Schema(
  {
    inquiryRef: {
      type: String,
      unique: true,
      default: () => "INQ-" + uuidv4().split("-")[0].toUpperCase()
    },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    name: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },

    inquiryType: {
      type: String,
      enum: ["Product", "Pricing", "Installation", "Warranty", "AMC", "Other"],
      default: "Other"
    },

    // subject kept for backward compat
    subject: { type: String, trim: true, default: "" },

    message: { type: String, trim: true, default: "" },
    attachmentUrl: { type: String, default: "" },

    thread: [threadMessageSchema],

    status: {
      type: String,
      enum: ["Ongoing", "Addressed", "Closed"],
      default: "Ongoing"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Inquiry", inquirySchema);
