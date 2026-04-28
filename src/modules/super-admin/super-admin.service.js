const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../../models/User");
const Order = require("../../models/Order");
const Inquiry = require("../../models/Inquiry");
const ServiceRequest = require("../../models/ServiceRequest");
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

exports.getDashboardSummary = async () => {
  const [
    totalUsers,
    activeUsers,
    deactivatedUsers,
    pendingReactivationRequests,
    totalOrders,
    pendingOrders,
    totalInquiries,
    openInquiries,
    totalServiceRequests,
    openServiceRequests
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isActive: { $ne: false } }),
    User.countDocuments({ isActive: false }),
    User.countDocuments({
      reactivationRequests: {
        $elemMatch: { status: "pending" }
      }
    }),
    Order.countDocuments({}),
    Order.countDocuments({ status: { $in: ["Pending"] } }),
    Inquiry.countDocuments({}),
    Inquiry.countDocuments({ status: { $in: ["Ongoing"] } }),
    ServiceRequest.countDocuments({}),
    ServiceRequest.countDocuments({ status: { $in: ["Pending", "Assigned", "In Progress", "Ongoing"] } })
  ]);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      deactivated: deactivatedUsers,
      pendingReactivationRequests
    },
    operations: {
      totalOrders,
      pendingOrders,
      totalInquiries,
      openInquiries,
      totalServiceRequests,
      openServiceRequests
    }
  };
};

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
    phoneVerified: false,
    needsPasswordChange: true
  });

  await user.save();

  // No OTP sending when super admin creates user
  // Users will be prompted to verify email after first login and password change

  return formatUserResponse(user);
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

  return formatUserResponse(user);
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
  return formatUserResponse(user);
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
    data: users.map(user => formatUserResponse(user)),
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum)
    }
  };
};

/**
 * Send deactivation email to user
 */
async function sendDeactivationEmail(toEmail, userName, reason, reactivationLink) {
  await transporter.sendMail({
    from: `AirLux <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "AirLux — Account Deactivated",
    html: `
      <p>Hi ${userName},</p>
      <p>Your account has been deactivated due to the following reason:</p>
      <p><strong>${reason}</strong></p>
      <p>If you believe this is an error or would like to request reactivation, please click the button below:</p>
      <p><a href="${reactivationLink}" style="display:inline-block;padding:10px 20px;background-color:#1f5b45;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Request Reactivation</a></p>
      <p>Or copy this link: <a href="${reactivationLink}">${reactivationLink}</a></p>
      <p>Thank you,<br>AirLux Team</p>
    `
  });
  console.log(`[DEV] Deactivation email sent to ${toEmail}`);
}

/**
 * Send reactivation decision email to user
 */
async function sendReactivationDecisionEmail(toEmail, userName, approved, adminResponse, isDirectReactivation = false) {
  const subject = approved
    ? "AirLux — Your Account Has Been Reactivated"
    : "AirLux — Reactivation Request Status";

  const approvedText = isDirectReactivation
    ? "Great news! Your account has been <strong>REACTIVATED</strong> by our administrative team."
    : "Great news! Your account reactivation request has been <strong>APPROVED</strong>.";

  const html = approved
    ? `
      <p>Hi ${userName},</p>
      <p>${approvedText}</p>
      <p>Your account is now active and you can login immediately.</p>
      ${adminResponse ? `<p><strong>Message from our team:</strong> ${adminResponse}</p>` : ""}
      <p>You can now access your account at: <a href="${process.env.FRONTEND_URL || "http://localhost:4200"}/login">Login Here</a></p>
      <p>Thank you,<br>AirLux Team</p>
    `
    : `
      <p>Hi ${userName},</p>
      <p>Thank you for your reactivation request. Unfortunately, it has been <strong>REJECTED</strong> at this time.</p>
      ${adminResponse ? `<p><strong>Reason:</strong> ${adminResponse}</p>` : ""}
      <p>If you believe this is incorrect or would like to know more, please contact our support team.</p>
      <p>Thank you,<br>AirLux Team</p>
    `;

  await transporter.sendMail({
    from: `AirLux <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    html,
  });
  console.log(`[DEV] Reactivation decision email (${approved ? "approved" : "rejected"}) sent to ${toEmail}`);
}

/**
 * Deactivate user account
 */
exports.deactivateUser = async (userId, reason) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  user.isActive = false;
  user.deactivatedAt = new Date();
  user.deactivationReason = reason || "";
  await user.save();

  // Send deactivation email
  if (user.email) {
    const reactivationLink = `${process.env.FRONTEND_URL}/reactivation-request?email=${encodeURIComponent(user.email)}`;
    await sendDeactivationEmail(user.email, user.fullName, reason, reactivationLink);
  }

  return formatUserResponse(user);
};

/**
 * Submit reactivation request
 */
exports.submitReactivationRequest = async (email, userReason) => {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    throw new Error("User not found");
  }

  if (user.isActive) {
    throw new Error("Account is already active");
  }

  // Add reactivation request
  user.reactivationRequests.push({
    requestedAt: new Date(),
    userReason,
    status: "pending"
  });

  await user.save();

  return {
    message: "Reactivation request submitted successfully",
    status: "pending"
  };
};

/**
 * Get pending reactivation requests
 */
exports.getReactivationRequests = async (options = {}) => {
  const { page = 1, limit = 10, status = "pending" } = options;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  const query = {
    reactivationRequests: { $elemMatch: { status } }
  };

  const [users, total] = await Promise.all([
    User.find(query)
      .select("-passwordHash -emailOtp -phoneOtp")
      .skip(skip)
      .limit(limitNum)
      .sort({ "reactivationRequests.requestedAt": -1 }),
    User.countDocuments(query)
  ]);

  // Format response
  const requests = [];
  users.forEach(user => {
    const userRequests = user.reactivationRequests.filter(req => req.status === status);
    userRequests.forEach(req => {
      requests.push({
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        deactivationReason: user.deactivationReason,
        requestedAt: req.requestedAt,
        userReason: req.userReason,
        requestStatus: req.status
      });
    });
  });

  return {
    data: requests,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum)
    }
  };
};

/**
 * Approve or reject reactivation request
 */
exports.handleReactivationRequest = async (userId, approve, adminResponse = "") => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Find the most recent pending request
  const pendingRequest = user.reactivationRequests.find(req => req.status === "pending");
  if (!pendingRequest && !approve) {
    throw new Error("No pending reactivation request found to reject");
  }

  const now = new Date();
  if (pendingRequest) {
    pendingRequest.status = approve ? "approved" : "rejected";
    pendingRequest.respondedAt = now;
    pendingRequest.adminResponse = adminResponse;
  }

  if (approve) {
    user.isActive = true;
    user.reactivatedAt = now;
    await user.save();
  } else {
    // Hard delete user when request is rejected
    await User.findByIdAndDelete(userId);
  }

  // Send email notification to user (only if approved or before deletion for rejected)
  if (user.email) {
    try {
      const isDirectReactivation = !pendingRequest;
      await sendReactivationDecisionEmail(user.email, user.fullName, approve, adminResponse, isDirectReactivation);
    } catch (emailErr) {
      console.error("Failed to send reactivation decision email:", emailErr.message);
    }
  }

  return {
    message: approve ? "User reactivated successfully" : "Reactivation request rejected and user deleted",
    approved: approve
  };
};

/**
 * Format user response (exclude sensitive fields)
 */
function formatUserResponse(user) {
  return {
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    authMethods: user.authMethods,
    isActive: user.isActive,
    deactivatedAt: user.deactivatedAt,
    deactivationReason: user.deactivationReason,
    reactivatedAt: user.reactivatedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

/**
 * Export formatUserResponse to be accessible as exports.formatUserResponse
 */
exports.formatUserResponse = formatUserResponse;
