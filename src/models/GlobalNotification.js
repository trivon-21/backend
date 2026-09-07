const mongoose = require("mongoose");

const globalNotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: ["general", "system_alert", "announcement", "order", "service", "inquiry", "feedback"],
      default: "general"
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal"
    },
    actionUrl: {
      type: String,
      trim: true,
      default: ""
    },
    targetRoles: {
      type: [String],
      default: ["ALL"]
    },
    isScheduled: {
      type: Boolean,
      default: false
    },
    scheduledFor: {
      type: Date,
      default: null
    },
    status: {
      type: String,
      enum: ["Draft", "Scheduled", "Sent", "Cancelled"],
      default: "Draft"
    },
    sentAt: {
      type: Date,
      default: null
    },
    recipientCount: {
      type: Number,
      default: 0
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);

globalNotificationSchema.index({ status: 1, scheduledFor: 1 });
globalNotificationSchema.index({ createdAt: -1 });

module.exports =
  mongoose.models.GlobalNotification ||
  mongoose.model("GlobalNotification", globalNotificationSchema);
