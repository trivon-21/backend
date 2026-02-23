const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true, default: "" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["CUSTOMER", "CSA", "INSPECTION", "MAIN_TECH", "SERVICE_TEAM", "FINANCE", "INVENTORY", "MANAGER"],
      default: "CUSTOMER"
    },
    gender: { type: String, enum: ["Male", "Female", "Other", ""], default: "" },
    address: { type: String, trim: true, default: "" },
    phoneNumber: { type: String, trim: true, default: "" },
    profilePhoto: { type: String, default: "" },
    additionalEmails: [
      {
        email: { type: String, lowercase: true, trim: true },
        addedAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);