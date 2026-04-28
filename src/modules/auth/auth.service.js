const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const User = require("../../models/User");

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function createLoginError(message, code, context = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, context);
  return error;
}

function buildUserContext(user, loginMethod, loginIdentifier) {
  if (!user) {
    return {
      loginMethod,
      loginIdentifier,
    };
  }

  return {
    userId: user._id,
    userRole: user.role,
    userEmail: user.email || null,
    userPhone: user.phoneNumber || null,
    userName: user.fullName || null,
    loginMethod,
    loginIdentifier,
  };
}

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

function getEmailTransporter() {
  const emailUser = String(process.env.EMAIL_USER || "").trim();
  // Gmail app passwords are often copied with spaces; strip them safely.
  const emailPass = String(process.env.EMAIL_PASS || "").replace(/\s+/g, "");

  if (!emailUser || !emailPass) {
    throw new Error("EMAIL_NOT_CONFIGURED");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: emailUser, pass: emailPass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  });
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

function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return;
  }

  const credentialsPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!credentialsPath) {
    throw new Error("Firebase admin credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS.");
  }

  const resolvedPath = path.isAbsolute(credentialsPath) ? credentialsPath : path.resolve(credentialsPath);
  const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

async function verifyFirebasePhoneToken(idToken) {
  initializeFirebaseAdmin();
  return admin.auth().verifyIdToken(idToken);
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
exports.signup = async (authInput, fullName, password, options = {}) => {
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

    let firebaseVerified = false;

    if (options.firebaseIdToken) {
      const decodedToken = await verifyFirebasePhoneToken(options.firebaseIdToken);

      if (!decodedToken.phone_number) {
        throw new Error("Firebase verification did not include a phone number");
      }

      if (decodedToken.phone_number !== normalizedPhone) {
        throw new Error("Firebase phone verification does not match the submitted phone number");
      }

      if (options.firebasePhoneNumber && options.firebasePhoneNumber !== decodedToken.phone_number) {
        throw new Error("Firebase phone verification mismatch");
      }

      firebaseVerified = true;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      fullName,
      phoneNumber: normalizedPhone,
      passwordHash,
      role: "CUSTOMER",
      phoneVerified: firebaseVerified,
      authMethods: ["phone"]
    });

    if (!firebaseVerified) {
      const otp = await generateAndSavePhoneOtp(user._id);

      // Always log OTP for development/testing
      console.log("\n=== PHONE VERIFICATION OTP ===");
      console.log(`OTP for ${user.phoneNumber}: ${otp}`);
      console.log("===============================\n");
    }

    const token = signToken(user);

    return {
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        phoneVerified: firebaseVerified,
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
    throw createLoginError("Invalid email or phone number format", "INVALID_IDENTIFIER_FORMAT", {
      loginMethod: "UNKNOWN",
      loginIdentifier: authInput,
    });
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
    if (!user) {
      throw createLoginError("Invalid email or password", "INVALID_CREDENTIALS", {
        loginMethod: "EMAIL",
        loginIdentifier: normalizedEmail,
      });
    }

    // Check if account is deactivated
    if (!user.isActive) {
      throw createLoginError("This account has been deactivated", "ACCOUNT_DEACTIVATED", {
        ...buildUserContext(user, "EMAIL", normalizedEmail),
        deactivationReason: user.deactivationReason || "",
        canReactivate: true,
      });
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      throw createLoginError(
        `Account locked. Try again in ${minutesLeft} minute${minutesLeft > 1 ? "s" : ""}.`,
        "ACCOUNT_LOCKED",
        buildUserContext(user, "EMAIL", normalizedEmail)
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);

    if (!ok) {
      const newAttempts = (user.loginAttempts || 0) + 1;
      const updates = { loginAttempts: newAttempts };

      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        updates.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        updates.loginAttempts = 0;
        await User.findByIdAndUpdate(user._id, { $set: updates });
        throw createLoginError(
          "Account locked for 15 minutes due to too many failed login attempts.",
          "ACCOUNT_LOCKED",
          buildUserContext(user, "EMAIL", normalizedEmail)
        );
      }

      await User.findByIdAndUpdate(user._id, { $set: updates });
      const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;
      throw createLoginError(
        `Invalid email or password. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining before account lock.`,
        "INVALID_CREDENTIALS",
        buildUserContext(user, "EMAIL", normalizedEmail)
      );
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
      throw createLoginError("Invalid phone number format", "INVALID_PHONE_FORMAT", {
        loginMethod: "PHONE",
        loginIdentifier: authInput,
      });
    }

    const normalizedPhone = normalizePhoneNumber(authInput);
    const user = await User.findOne({ phoneNumber: normalizedPhone });

    if (!user) {
      throw createLoginError("Invalid phone number or password", "INVALID_CREDENTIALS", {
        loginMethod: "PHONE",
        loginIdentifier: normalizedPhone,
      });
    }

    // Check if account is deactivated
    if (!user.isActive) {
      throw createLoginError("This account has been deactivated", "ACCOUNT_DEACTIVATED", {
        ...buildUserContext(user, "PHONE", normalizedPhone),
        deactivationReason: user.deactivationReason || "",
        canReactivate: true,
      });
    }

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      throw createLoginError(
        `Account locked. Try again in ${minutesLeft} minute${minutesLeft > 1 ? "s" : ""}.`,
        "ACCOUNT_LOCKED",
        buildUserContext(user, "PHONE", normalizedPhone)
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);

    if (!ok) {
      const newAttempts = (user.loginAttempts || 0) + 1;
      const updates = { loginAttempts: newAttempts };

      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        updates.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        updates.loginAttempts = 0;
        await User.findByIdAndUpdate(user._id, { $set: updates });
        throw createLoginError(
          "Account locked for 15 minutes due to too many failed login attempts.",
          "ACCOUNT_LOCKED",
          buildUserContext(user, "PHONE", normalizedPhone)
        );
      }

      await User.findByIdAndUpdate(user._id, { $set: updates });
      const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;
      throw createLoginError(
        `Invalid phone number or password. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining before account lock.`,
        "INVALID_CREDENTIALS",
        buildUserContext(user, "PHONE", normalizedPhone)
      );
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
  const normalizedEmail = String(email || "").toLowerCase().trim();
  let user = await User.findOne({ email: normalizedEmail });
  let recipientEmail = normalizedEmail;

  if (!user) {
    user = await User.findOne({
      additionalEmails: {
        $elemMatch: {
          email: normalizedEmail,
          verified: true
        }
      }
    });
  }

  if (!user) {
    // Always respond successfully to prevent email enumeration
    return { userFound: false, emailSent: false };
  }

  if (user.email && user.email.toLowerCase() === normalizedEmail) {
    recipientEmail = user.email;
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

  try {
    const transporter = getEmailTransporter();
    await transporter.sendMail({
      from: `AirLux <${String(process.env.EMAIL_USER || "").trim()}>`,
      to: recipientEmail,
      subject: "AirLux — Password Reset Request",
      html: `
        <p>Hi ${user.fullName},</p>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <p style="margin: 20px 0;">
          <a
            href="${resetUrl}"
            style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;"
          >Reset Password</a>
        </p>
        <p style="font-size:13px;color:#555;">If the button does not work, copy and paste this URL into your browser:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires in <strong>1 hour</strong>.</p>
        <p>If you did not request this, please ignore this email.</p>
      `
    });
  } catch (emailErr) {
    console.error("Failed to send reset email:", emailErr);
    throw new Error("RESET_EMAIL_SEND_FAILED");
  }

  return { userFound: true, emailSent: true };
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
