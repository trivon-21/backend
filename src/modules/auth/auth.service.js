const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../../models/User");

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Sign JWT token
 */
function signToken(user, rememberMe = true) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: rememberMe ? (process.env.JWT_EXPIRES_IN || "7d") : "24h" }
  );
}

/**
 * Send OTP email
 */
async function sendOtpEmail(transporter, toEmail, userName, otp) {
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
}

/**
 * Generate and save OTP for email
 */
async function generateAndSaveOtp(userId) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
  await User.findByIdAndUpdate(userId, {
    $set: {
      emailOtp: hashedOtp,
      emailOtpExpires: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    }
  });
  return otp;
}

/**
 * Identify if input is email or phone
 */
function identifyAuthType(identifier) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^0\d{9}$/; // Sri Lankan format: 0XXXXXXXXX (10 digits)

  if (emailRegex.test(identifier)) {
    return "email";
  } else if (phoneRegex.test(identifier)) {
    return "phone";
  }
  return "invalid";
}

/**
 * Validate phone number format (Sri Lankan: 0XXXXXXXXX)
 */
function validatePhoneFormat(phoneNumber) {
  const phoneRegex = /^0\d{9}$/;
  return phoneRegex.test(phoneNumber.trim());
}

/**
 * Normalize phone number (convert 0XXXXXXXXX to +94XXXXXXXXX)
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
 * Generate and save phone OTP
 */
async function generateAndSavePhoneOtp(userId) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
  await User.findByIdAndUpdate(userId, {
    $set: {
      phoneOtp: hashedOtp,
      phoneOtpExpires: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    }
  });
  return otp;
}

/**
 * Signup with email or phone
 */
exports.signup = async (authInput, fullName, password) => {
  const authType = identifyAuthType(authInput);
  if (authType === "invalid") {
    throw new Error("Invalid email or phone number format");
  }

  if (authType === "email") {
    // SIGNUP WITH EMAIL
    const normalizedEmail = authInput.toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw new Error("Email already registered");
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      fullName,
      email: normalizedEmail,
      passwordHash,
      role: "CUSTOMER",
      authMethods: ["email"]
    });

    const otp = await generateAndSaveOtp(user._id);

    // Development fallback: always log OTP to console
    console.log("\n=== EMAIL VERIFICATION OTP ===");
    console.log(`OTP for ${user.email}: ${otp}`);
    console.log("==============================\n");

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 10000
        });
        await sendOtpEmail(transporter, user.email, user.fullName, otp);
      } catch (emailErr) {
        console.error("Failed to send OTP email:", emailErr.message);
      }
    }

    const token = signToken(user);

    return {
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        emailVerified: false,
        authMethods: ['email']
      }
    };
  }

  if (authType === "phone") {
    // SIGNUP WITH PHONE
    if (!validatePhoneFormat(authInput)) {
      throw new Error("Invalid phone number format");
    }

    const normalizedPhone = normalizePhoneNumber(authInput);
    const existing = await User.findOne({ phoneNumber: normalizedPhone });
    if (existing) {
      throw new Error("Phone number already registered");
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      fullName,
      phoneNumber: normalizedPhone,
      passwordHash,
      role: "CUSTOMER",
      authMethods: ["phone"]
    });

    const otp = await generateAndSavePhoneOtp(user._id);

    // Always log OTP for development/testing
    console.log("\n=== PHONE VERIFICATION OTP ===");
    console.log(`OTP for ${user.phoneNumber}: ${otp}`);
    console.log("===============================\n");

    const token = signToken(user);

    return {
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        phoneVerified: false,
        authMethods: ['phone']
      }
    };
  }
};

/**
 * Login with email or phone
 */
exports.login = async (authInput, password, rememberMe = true) => {
  const authType = identifyAuthType(authInput);
  if (authType === "invalid") {
    throw new Error("Invalid email or phone number format");
  }

  if (authType === "email") {
    // LOGIN WITH EMAIL
    const normalizedEmail = authInput.toLowerCase();

    let user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      user = await User.findOne({
        additionalEmails: { $elemMatch: { email: normalizedEmail, verified: true } }
      });
    }
    if (!user) throw new Error("Invalid email or password");

    // Check if account is deactivated
    if (!user.isActive) {
      throw {
        code: "ACCOUNT_DEACTIVATED",
        message: "This account has been deactivated",
        deactivationReason: user.deactivationReason || "",
        canReactivate: true
      };
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      throw new Error(`Account locked. Try again in ${minutesLeft} minute${minutesLeft > 1 ? "s" : ""}.`);
    }

    const ok = await bcrypt.compare(password, user.passwordHash);

    if (!ok) {
      const newAttempts = (user.loginAttempts || 0) + 1;
      const updates = { loginAttempts: newAttempts };

      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        updates.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        updates.loginAttempts = 0;
        await User.findByIdAndUpdate(user._id, { $set: updates });
        throw new Error("Account locked for 15 minutes due to too many failed login attempts.");
      }

      await User.findByIdAndUpdate(user._id, { $set: updates });
      const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;
      throw new Error(`Invalid email or password. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining before account lock.`);
    }

    // Successful login — clear lock fields
    await User.findByIdAndUpdate(user._id, {
      $set: { loginAttempts: 0 },
      $unset: { lockUntil: "" }
    });

    const token = signToken(user, rememberMe !== false);

    return {
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified || false,
        authMethods: user.authMethods || ['email'],
        needsPasswordChange: user.needsPasswordChange || false
      }
    };
  }

  if (authType === "phone") {
    // LOGIN WITH PHONE
    if (!validatePhoneFormat(authInput)) {
      throw new Error("Invalid phone number format");
    }

    const normalizedPhone = normalizePhoneNumber(authInput);
    const user = await User.findOne({ phoneNumber: normalizedPhone });

    if (!user) {
      throw new Error("Invalid phone number or password");
    }

    // Check if account is deactivated
    if (!user.isActive) {
      throw {
        code: "ACCOUNT_DEACTIVATED",
        message: "This account has been deactivated",
        deactivationReason: user.deactivationReason || "",
        canReactivate: true
      };
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      throw new Error(`Account locked. Try again in ${minutesLeft} minute${minutesLeft > 1 ? "s" : ""}.`);
    }

    const ok = await bcrypt.compare(password, user.passwordHash);

    if (!ok) {
      const newAttempts = (user.loginAttempts || 0) + 1;
      const updates = { loginAttempts: newAttempts };

      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        updates.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        updates.loginAttempts = 0;
        await User.findByIdAndUpdate(user._id, { $set: updates });
        throw new Error("Account locked for 15 minutes due to too many failed login attempts.");
      }

      await User.findByIdAndUpdate(user._id, { $set: updates });
      const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;
      throw new Error(`Invalid phone number or password. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining before account lock.`);
    }

    // Successful login — clear lock fields
    await User.findByIdAndUpdate(user._id, {
      $set: { loginAttempts: 0 },
      $unset: { lockUntil: "" }
    });

    const token = signToken(user, rememberMe !== false);

    return {
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        phoneVerified: user.phoneVerified || false,
        authMethods: user.authMethods || ['phone'],
        needsPasswordChange: user.needsPasswordChange || false
      }
    };
  }
};

/**
 * Forgot password
 */
exports.forgotPassword = async (email) => {
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    // Always respond successfully to prevent email enumeration
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  await User.findByIdAndUpdate(user._id, {
    $set: {
      resetPasswordToken: hashedToken,
      resetPasswordExpires: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    }
  });

  const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:4200"}/reset-password/${rawToken}`;

  console.log("\n=== PASSWORD RESET LINK ===");
  console.log(resetUrl);
  console.log("===========================\n");

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      });

      await transporter.sendMail({
        from: `AirLux <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: "AirLux — Password Reset Request",
        html: `
          <p>Hi ${user.fullName},</p>
          <p>You requested a password reset. Click the link below to reset your password:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>This link expires in <strong>1 hour</strong>.</p>
          <p>If you did not request this, please ignore this email.</p>
        `
      });
    } catch (emailErr) {
      console.error("Failed to send reset email:", emailErr.message);
    }
  }
};

/**
 * Reset password
 */
exports.resetPassword = async (token, password) => {
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!user) {
    throw new Error("Reset token is invalid or has expired.");
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  await User.findByIdAndUpdate(user._id, {
    $set: { passwordHash, loginAttempts: 0 },
    $unset: { resetPasswordToken: "", resetPasswordExpires: "", lockUntil: "" }
  });
};

/**
 * Verify email
 */
exports.verifyEmail = async (userId, otp) => {
  const user = await User.findById(userId);

  if (!user) throw new Error("User not found");
  if (user.emailVerified) throw new Error("Email is already verified.");
  if (!user.emailOtp || !user.emailOtpExpires) throw new Error("No OTP found. Please request a new one.");
  if (user.emailOtpExpires < Date.now()) throw new Error("OTP has expired. Please request a new one.");

  const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
  if (user.emailOtp !== hashedOtp) throw new Error("Invalid OTP.");

  await User.findByIdAndUpdate(user._id, {
    $set: { emailVerified: true },
    $unset: { emailOtp: "", emailOtpExpires: "" }
  });
};

/**
 * Resend email OTP
 */
exports.resendEmailOtp = async (userId) => {
  const user = await User.findById(userId);

  if (!user) throw new Error("User not found");
  if (user.emailVerified) throw new Error("Email is already verified.");

  const otp = await generateAndSaveOtp(user._id);

  console.log("\n=== EMAIL VERIFICATION OTP (RESEND) ===");
  console.log(`OTP for ${user.email}: ${otp}`);
  console.log("=======================================\n");

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      });
      await sendOtpEmail(transporter, user.email, user.fullName, otp);
    } catch (emailErr) {
      console.error("Failed to send OTP email:", emailErr.message);
    }
  }
};

/**
 * Verify phone
 */
exports.verifyPhone = async (userId, otp) => {
  const user = await User.findById(userId);

  if (!user) throw new Error("User not found");
  if (user.phoneVerified) throw new Error("Phone number is already verified.");
  if (!user.phoneOtp || !user.phoneOtpExpires) throw new Error("No OTP found. Please request a new one.");
  if (user.phoneOtpExpires < Date.now()) throw new Error("OTP has expired. Please request a new one.");

  const trimmedOtp = otp.toString().trim();
  const hashedOtp = crypto.createHash("sha256").update(trimmedOtp).digest("hex");

  console.log("\n=== OTP VERIFICATION ===");
  console.log(`Received OTP: "${trimmedOtp}"`);
  console.log(`Stored hash: ${user.phoneOtp}`);
  console.log(`Generated hash: ${hashedOtp}`);
  console.log(`Match: ${user.phoneOtp === hashedOtp}`);
  console.log("=======================\n");

  if (user.phoneOtp !== hashedOtp) throw new Error("Invalid OTP.");

  await User.findByIdAndUpdate(user._id, {
    $set: { phoneVerified: true },
    $unset: { phoneOtp: "", phoneOtpExpires: "" }
  });
};

/**
 * Resend phone OTP
 */
exports.resendPhoneOtp = async (userId) => {
  const user = await User.findById(userId);

  if (!user) throw new Error("User not found");
  if (user.phoneVerified) throw new Error("Phone number is already verified.");

  const otp = await generateAndSavePhoneOtp(user._id);

  // Always log OTP for development/testing
  console.log("\n=== PHONE VERIFICATION OTP ===");
  console.log(`OTP for ${user.phoneNumber}: ${otp}`);
  console.log("===============================\n");
};
