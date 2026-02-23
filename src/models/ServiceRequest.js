const mongoose = require("mongoose");

const serviceRequestSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    subject: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["Ongoing", "Addressed", "Closed"],
      default: "Ongoing"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ServiceRequest", serviceRequestSchema);
