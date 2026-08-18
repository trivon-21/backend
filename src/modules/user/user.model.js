// src/models/User.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const additionalEmailSchema = new Schema({
  email: { type: String, trim: true, lowercase: true },
  addedAt: { type: Date, default: Date.now },
  verified: { type: Boolean, default: false },
  otp: String,
  otpExpires: Date,
});

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    lastName: { type: String, default: '', trim: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    phoneNumber: { type: String, trim: true, unique: true, sparse: true },
    address: { type: String, default: '', trim: true }, 
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      default: 'CUSTOMER',
      enum: [
        'SUPER_ADMIN', 'CUSTOMER', 'CSA', 'INSPECTION', 'MAIN_TECH',
        'SERVICE_TEAM', 'FINANCE', 'INVENTORY', 'MANAGER',
      ],
    },
    gender: { type: String, default: '', enum: ['Male', 'Female', 'Other', ''] },
    profilePhoto: { type: String, default: '' },
    additionalEmails: [additionalEmailSchema],
    emailVerified: { type: Boolean, default: false },
    emailOtp: String,
    emailOtpExpires: Date,
    phoneVerified: { type: Boolean, default: false },
    phoneOtp: String,
    phoneOtpExpires: Date,
    authMethods: { type: [String], default: ['email'], enum: ['email', 'phone'] },
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
  },
  { timestamps: true, collection: 'users' }
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('User', userSchema);
