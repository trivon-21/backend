const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    feedbackFor: {
      type: String,
      enum: ["Order", "Installation", "Service", "AMC Service Visit"],
      required: true
    },
    referenceId: { type: mongoose.Schema.Types.ObjectId },
    referenceLabel: { type: String, default: "" },

    productQuality: { type: Number, min: 1, max: 5, default: null },
    technicianBehavior: { type: Number, min: 1, max: 5, default: null },
    serviceQuality: { type: Number, min: 1, max: 5, default: null },
    deliveryExperience: { type: Number, min: 1, max: 5, default: null },

    comment: { type: String, trim: true, default: "" },
    imageUrl: { type: String, default: "" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Feedback", feedbackSchema);
