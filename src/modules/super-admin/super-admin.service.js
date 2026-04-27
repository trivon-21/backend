const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../../models/User");
const { sendPhoneOtp } = require("../../config/twilio");

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const VALID_ROLES = ["SUPER_ADMIN", "CUSTOMER", "CSA", "INSPECTION", "MAIN_TECH", "SERVICE_TEAM", "FINANCE", "INVENTORY", "MANAGER"];

/**
 * Send OTP email to new user
 */
async function sendOtpEmail(toEmail, userName, otp) {
  await transporter.sendMail({
    from: `AirLux <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "AirLux — Verify Your Email",
    html: `
      <p>Hi ${userName},</p>
      <p>Your email verification code is:</p>
      <h2 style="letter-spacing:6px;font-size:32px;">${otp}</h2>
      <p>This code expires in <strong>10 minutes</strong>.</p>
      <p>If you did not create an AirLux account, please ignore this email.</p>
    `
  });
  console.log(`[DEV] Email OTP for ${toEmail}: ${otp}`);
}

/**
 * Send SMS OTP to new user
 */
async function sendSmsOtp(phoneNumber, otp) {
  await sendPhoneOtp(phoneNumber, otp);
  console.log(`[DEV] SMS OTP for ${phoneNumber}: ${otp}`);
}

/**
 * Generate and hash OTP
 */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

/**
 * Normalize phone number (0XXXXXXXXX to +94XXXXXXXXX)
 */
function normalizePhoneNumber(phoneNumber) {
  const cleaned = phoneNumber.trim();
  const withoutSpaces = cleaned.replace(/[\s\-]/g, "");
  if (withoutSpaces.startsWith("0")) {
    return "+94" + withoutSpaces.substring(1);
  }
  return withoutSpaces;
}

/**
 * Validate phone format (Sri Lankan: 0XXXXXXXXX)
 */
function validatePhoneFormat(phoneNumber) {
  const phoneRegex = /^0\d{9}$/;
  return phoneRegex.test(phoneNumber.trim());
}

/**
 * Create a new user
 */
exports.createUser = async (data) => {
  const { fullName, email, phoneNumber, role, password } = data;

  if (!fullName || !password || !role) {
    throw new Error("fullName, password, and role are required");
  }

  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role. Valid roles: ${VALID_ROLES.join(", ")}`);
  }

  if (!email && !phoneNumber) {
    throw new Error("Either email or phone number is required");
  }

  // Validate email format
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error("Invalid email format");
    }
  }

  // Validate phone format
  if (phoneNumber && !validatePhoneFormat(phoneNumber)) {
    throw new Error("Invalid phone format. Expected: 0XXXXXXXXX (Sri Lankan format)");
  }

  // Check if user already exists
  if (email) {
    const existingEmailUser = await User.findOne({ email: email.toLowerCase() });
    if (existingEmailUser) {
      throw new Error("User with this email already exists");
    }
  }

  if (phoneNumber) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const existingPhoneUser = await User.findOne({ phoneNumber: normalizedPhone });
    if (existingPhoneUser) {
      throw new Error("User with this phone number already exists");
    }
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Generate OTPs for verification
  const emailOtp = generateOtp();
  const emailOtpHash = hashOtp(emailOtp);
  const phoneOtp = generateOtp();
  const phoneOtpHash = hashOtp(phoneOtp);
  const phoneNumberNormalized = phoneNumber ? normalizePhoneNumber(phoneNumber) : null;

  // Create user
  const user = new User({
    fullName,
    email: email ? email.toLowerCase() : null,
    phoneNumber: phoneNumberNormalized,
    role,
    passwordHash,
    emailOtp: email ? emailOtpHash : null,
    emailOtpExpires: email ? new Date(Date.now() + 10 * 60 * 1000) : null,
    phoneOtp: phoneNumber ? phoneOtpHash : null,
    phoneOtpExpires: phoneNumber ? new Date(Date.now() + 10 * 60 * 1000) : null,
    authMethods: [
      email ? "email" : null,
      phoneNumber ? "phone" : null
    ].filter(Boolean),
    emailVerified: false,
    phoneVerified: false
  });

  await user.save();

  // Send OTPs
  if (email) {
    await sendOtpEmail(email, fullName, emailOtp);
  }
  if (phoneNumber) {
    await sendSmsOtp(phoneNumberNormalized, phoneOtp);
  }

  return this.formatUserResponse(user);
};

/**
 * Update user details
 */
exports.updateUser = async (userId, data) => {
  const { fullName, email, phoneNumber, role } = data;

  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Validate role if provided
  if (role) {
    if (!VALID_ROLES.includes(role)) {
      throw new Error(`Invalid role. Valid roles: ${VALID_ROLES.join(", ")}`);
    }
    user.role = role;
  }

  // Update fullName
  if (fullName !== undefined) {
    user.fullName = fullName;
  }

  // Update email if provided
  if (email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error("Invalid email format");
    }

    const existingEmailUser = await User.findOne({
      email: email.toLowerCase(),
      _id: { $ne: userId }
    });
    if (existingEmailUser) {
      throw new Error("Email already in use by another user");
    }

    user.email = email.toLowerCase();
  }

  // Update phone if provided
  if (phoneNumber !== undefined) {
    if (!validatePhoneFormat(phoneNumber)) {
      throw new Error("Invalid phone format. Expected: 0XXXXXXXXX (Sri Lankan format)");
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const existingPhoneUser = await User.findOne({
      phoneNumber: normalizedPhone,
      _id: { $ne: userId }
    });
    if (existingPhoneUser) {
      throw new Error("Phone number already in use by another user");
    }

    user.phoneNumber = normalizedPhone;
  }

  await user.save();

  return this.formatUserResponse(user);
};

/**
 * Delete user (soft or hard delete)
 */
exports.deleteUser = async (userId, hardDelete = false) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (hardDelete) {
    // Hard delete
    await User.findByIdAndDelete(userId);
    return { message: "User permanently deleted", deleted: true };
  } else {
    // Soft delete - mark as inactive/disabled
    // Add isActive flag set to false (if schema supports it, or keep track separately)
    // For now, we'll use a flag approach - you may need to add this to the schema
    user.isActive = false;
    user.deactivatedAt = new Date();
    await user.save();
    return { message: "User deactivated", deleted: false };
  }
};

/**
 * Get user by ID
 */
exports.getUserById = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }
  return this.formatUserResponse(user);
};

/**
 * List users with pagination, filters, and search
 */
exports.listUsers = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    role = null,
    emailVerified = null,
    phoneVerified = null,
    search = null
  } = options;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, Math.min(100, parseInt(limit))); // Max 100 per page

  let query = {};

  // Filter by role
  if (role) {
    if (!VALID_ROLES.includes(role)) {
      throw new Error(`Invalid role filter. Valid roles: ${VALID_ROLES.join(", ")}`);
    }
    query.role = role;
  }

  // Filter by email verification status
  if (emailVerified !== null) {
    query.emailVerified = emailVerified === "true" || emailVerified === true;
  }

  // Filter by phone verification status
  if (phoneVerified !== null) {
    query.phoneVerified = phoneVerified === "true" || phoneVerified === true;
  }

  // Search by name or email
  if (search) {
    const searchRegex = new RegExp(search, "i");
    query.$or = [
      { fullName: searchRegex },
      { email: searchRegex }
    ];
  }

  const skip = (pageNum - 1) * limitNum;

  const [users, total] = await Promise.all([
    User.find(query)
      .select("-passwordHash -emailOtp -phoneOtp -emailOtpExpires -phoneOtpExpires -resetPasswordToken -resetPasswordExpires")
      .skip(skip)
      .limit(limitNum)
      .sort({ createdAt: -1 }),
    User.countDocuments(query)
  ]);

  return {
    data: users.map(user => this.formatUserResponse(user)),
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum)
    }
  };
};

/**
 * Format user response (exclude sensitive fields)
 */
exports.formatUserResponse = (user) => {
  return {
    _id: user._id,
    fullName: user.fullName,
    lastName: user.lastName || "",
    email: user.email || null,
    phoneNumber: user.phoneNumber || null,
    role: user.role,
    gender: user.gender || "",
    address: user.address || "",
    profilePhoto: user.profilePhoto || "",
    emailVerified: user.emailVerified || false,
    phoneVerified: user.phoneVerified || false,
    authMethods: user.authMethods || [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};
