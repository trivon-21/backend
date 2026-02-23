const mongoose = require("mongoose");

const inquirySchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    subject: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["Ongoing", "Addressed"],
      default: "Ongoing"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Inquiry", inquirySchema);
