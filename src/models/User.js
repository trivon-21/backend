const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true, default: "" },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "CUSTOMER", "CSA", "INSPECTION", "MAIN_TECH", "SERVICE_TEAM", "FINANCE", "INVENTORY", "MANAGER"],
      default: "CUSTOMER"
    },
    gender: { type: String, enum: ["Male", "Female", "Other", ""], default: "" },
    address: { type: String, trim: true, default: "" },
    phoneNumber: { type: String, unique: true, sparse: true, trim: true },
    profilePhoto: { type: String, default: "" },
    additionalEmails: [
      {
        email: { type: String, lowercase: true, trim: true },
        addedAt: { type: Date, default: Date.now },
        verified: { type: Boolean, default: false },
        otp: { type: String },
        otpExpires: { type: Date }
      }
    ],
    emailVerified: { type: Boolean, default: false },
    emailOtp: { type: String },
    emailOtpExpires: { type: Date },
    phoneVerified: { type: Boolean, default: false },
    phoneOtp: { type: String },
    phoneOtpExpires: { type: Date },
    authMethods: { type: [String], enum: ["email", "phone"], default: ["email"] },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    isActive: { type: Boolean, default: true },
    deactivatedAt: { type: Date, default: null },
    deactivationReason: { type: String, default: "" },
    reactivatedAt: { type: Date, default: null },
    reactivationRequests: [
      {
        requestedAt: { type: Date, default: Date.now },
        userReason: { type: String, required: true },
        status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
        respondedAt: { type: Date },
        adminResponse: { type: String }
      }
    ],
    notificationPreferences: {
      orderUpdates: { type: Boolean, default: true },
      inquiryResponses: { type: Boolean, default: true },
      serviceRequests: { type: Boolean, default: true },
      feedbackConfirmation: { type: Boolean, default: true },
      emailNotifications: { type: Boolean, default: true },
      pushNotifications: { type: Boolean, default: false }
    },
    notifications: [
      {
        type: {
          type: String,
          enum: ["order", "inquiry", "service", "feedback", "general"],
          default: "general"
        },
        title: { type: String, required: true, trim: true },
        message: { type: String, required: true, trim: true },
        read: { type: Boolean, default: false },
        actionUrl: { type: String, default: "" },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    needsPasswordChange: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);