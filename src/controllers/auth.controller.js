const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const LoggingService = require("../utils/logging-service");

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function signToken(user, rememberMe = true) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: rememberMe ? (process.env.JWT_EXPIRES_IN || "7d") : "24h" }
  );
}

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

// Helper: Identify if input is email or phone
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

// Helper: Validate phone number format (Sri Lankan: 0XXXXXXXXX)
function validatePhoneFormat(phoneNumber) {
  const phoneRegex = /^0\d{9}$/;
  return phoneRegex.test(phoneNumber.trim());
}

// Helper: Normalize phone number (convert 0XXXXXXXXX to +94XXXXXXXXX)
function normalizePhoneNumber(phoneNumber) {
  const cleaned = phoneNumber.trim();
  // Remove any spaces or dashes
  const withoutSpaces = cleaned.replace(/[\s\-]/g, "");
  // Convert 0XXXXXXXXX to +94XXXXXXXXX
  if (withoutSpaces.startsWith("0")) {
    return "+94" + withoutSpaces.substring(1);
  }
  return withoutSpaces;
}

// Helper: Generate and save phone OTP
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

// POST /api/auth/signup
exports.signup = async (req, res) => {
  try {
    const { fullName, email, password, identifier, phoneNumber } = req.body;

    // Support both old format (email field) and new format (identifier field)
    const authInput = identifier || email || phoneNumber;

    if (!authInput || !password || !fullName) {
      return res.status(400).json({ message: "fullName, password, and identifier (email or phone) are required" });
    }

    const authType = identifyAuthType(authInput);
    if (authType === "invalid") {
      return res.status(400).json({ message: "Invalid email or phone number format" });
    }

    // SIGNUP WITH EMAIL
    if (authType === "email") {
      const normalizedEmail = authInput.toLowerCase();
      const existing = await User.findOne({ email: normalizedEmail });
      if (existing) {
        return res.status(409).json({ message: "Email already registered" });
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

      return res.status(201).json({
        message: "Signup successful",
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          emailVerified: false,
          authMethods: ['email']
        }
      });
    }

    // SIGNUP WITH PHONE
    if (authType === "phone") {
      if (!validatePhoneFormat(authInput)) {
        return res.status(400).json({ message: "Invalid phone number format" });
      }

      const normalizedPhone = normalizePhoneNumber(authInput);
      const existing = await User.findOne({ phoneNumber: normalizedPhone });
      if (existing) {
        return res.status(409).json({ message: "Phone number already registered" });
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

      // For development: log OTP to console
      console.log("\n=== PHONE VERIFICATION OTP (CONSOLE) ===");
      console.log(`OTP for ${user.phoneNumber}: ${otp}`);
      console.log("========================================\n");

      const token = signToken(user);

      return res.status(201).json({
        message: "Signup successful. Please verify your phone number.",
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          role: user.role,
          phoneVerified: false,
          authMethods: ['phone']
        }
      });
    }
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password, rememberMe, identifier, phoneNumber } = req.body;

    // Support both old format (email field) and new format (identifier field)
    const authInput = identifier || email || phoneNumber;

    if (!authInput || !password) {
      return res.status(400).json({ message: "identifier (email or phone) and password are required" });
    }

    const authType = identifyAuthType(authInput);
    if (authType === "invalid") {
      return res.status(400).json({ message: "Invalid email or phone number format" });
    }

    // LOGIN WITH EMAIL
    if (authType === "email") {
      const normalizedEmail = authInput.toLowerCase();

      // Try primary email first, then verified additional emails
      let user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        user = await User.findOne({
          additionalEmails: { $elemMatch: { email: normalizedEmail, verified: true } }
        });
      }
      if (!user) return res.status(401).json({ message: "Invalid email or password" });

      // Check if account is locked
      if (user.lockUntil && user.lockUntil > Date.now()) {
        const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
        return res.status(423).json({
          message: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft > 1 ? "s" : ""}.`
        });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);

      if (!ok) {
        const newAttempts = (user.loginAttempts || 0) + 1;
        const updates = { loginAttempts: newAttempts };

        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          updates.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
          updates.loginAttempts = 0;
          await User.findByIdAndUpdate(user._id, { $set: updates });
          return res.status(423).json({
            message: "Account locked for 15 minutes due to too many failed login attempts."
          });
        }

        await User.findByIdAndUpdate(user._id, { $set: updates });
        const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;
        return res.status(401).json({
          message: `Invalid email or password. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining before account lock.`
        });
      }

      // Successful login — clear lock fields
      await User.findByIdAndUpdate(user._id, {
        $set: { loginAttempts: 0 },
        $unset: { lockUntil: "" }
      });

      const token = signToken(user, rememberMe !== false);

      // Log successful login
      await LoggingService.logActivity({
        userId: user._id,
        userRole: user.role,
        module: 'AUTH',
        action: 'Login',
        actionCategory: 'LOGIN',
        entity: 'User',
        entityId: user._id,
        reason: 'Email authentication',
        metadata: {
          authMethod: 'EMAIL',
          email: user.email,
        },
        request: req,
        status: 'SUCCESS',
        statusCode: 200,
      });

      return res.json({
        message: "Login successful",
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          emailVerified: user.emailVerified || false,
          authMethods: user.authMethods || ['email']
        }
      });
    }

    // LOGIN WITH PHONE
    if (authType === "phone") {
      if (!validatePhoneFormat(authInput)) {
        return res.status(400).json({ message: "Invalid phone number format" });
      }

      const normalizedPhone = normalizePhoneNumber(authInput);
      const user = await User.findOne({ phoneNumber: normalizedPhone });

      if (!user) {
        return res.status(401).json({ message: "Invalid phone number or password" });
      }

      // Check if account is locked
      if (user.lockUntil && user.lockUntil > Date.now()) {
        const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
        return res.status(423).json({
          message: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft > 1 ? "s" : ""}.`
        });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);

      if (!ok) {
        const newAttempts = (user.loginAttempts || 0) + 1;
        const updates = { loginAttempts: newAttempts };

        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          updates.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
          updates.loginAttempts = 0;
          await User.findByIdAndUpdate(user._id, { $set: updates });
          return res.status(423).json({
            message: "Account locked for 15 minutes due to too many failed login attempts."
          });
        }

        await User.findByIdAndUpdate(user._id, { $set: updates });
        const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;
        return res.status(401).json({
          message: `Invalid phone number or password. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining before account lock.`
        });
      }

      // Successful login — clear lock fields
      await User.findByIdAndUpdate(user._id, {
        $set: { loginAttempts: 0 },
        $unset: { lockUntil: "" }
      });

      const token = signToken(user, rememberMe !== false);

      // Log successful login
      await LoggingService.logActivity({
        userId: user._id,
        userRole: user.role,
        module: 'AUTH',
        action: 'Login',
        actionCategory: 'LOGIN',
        entity: 'User',
        entityId: user._id,
        reason: 'Phone authentication',
        metadata: {
          authMethod: 'PHONE',
          phoneNumber: user.phoneNumber,
        },
        request: req,
        status: 'SUCCESS',
        statusCode: 200,
      });

      return res.json({
        message: "Login successful",
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          role: user.role,
          phoneVerified: user.phoneVerified || false,
          authMethods: user.authMethods || ['phone']
        }
      });
    }
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/auth/forgot-password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always respond successfully to prevent email enumeration
    if (!user) {
      return res.json({ message: "If that email is registered, a reset link has been sent." });
    }

    // Generate random token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    await User.findByIdAndUpdate(user._id, {
      $set: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      }
    });

    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:4200"}/reset-password/${rawToken}`;

    // Development fallback: always log reset URL to console
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
        console.error("Failed to send reset email:", emailErr.message);
        // Continue — token is saved; user can still use the reset link from console logs
      }
    }

    return res.json({ message: "If that email is registered, a reset link has been sent." });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/auth/reset-password/:token
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) return res.status(400).json({ message: "Password is required" });

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Reset token is invalid or has expired." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await User.findByIdAndUpdate(user._id, {
      $set: { passwordHash, loginAttempts: 0 },
      $unset: { resetPasswordToken: "", resetPasswordExpires: "", lockUntil: "" }
    });

    return res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/auth/verify-email  (protected)
exports.verifyEmail = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: "OTP is required" });

    const user = req.user;

    if (user.emailVerified) {
      return res.status(400).json({ message: "Email is already verified." });
    }

    if (!user.emailOtp || !user.emailOtpExpires) {
      return res.status(400).json({ message: "No OTP found. Please request a new one." });
    }

    if (user.emailOtpExpires < Date.now()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
    if (user.emailOtp !== hashedOtp) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    await User.findByIdAndUpdate(user._id, {
      $set: { emailVerified: true },
      $unset: { emailOtp: "", emailOtpExpires: "" }
    });

    return res.json({ message: "Email verified successfully." });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/auth/resend-otp  (protected)
exports.resendOtp = async (req, res) => {
  try {
    const user = req.user;

    if (user.emailVerified) {
      return res.status(400).json({ message: "Email is already verified." });
    }

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

    return res.json({ message: "A new OTP has been sent to your email." });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/auth/verify-phone  (protected)
exports.verifyPhone = async (req, res) => {
  try {
    const { otp, sessionId } = req.body;
    if (!otp) return res.status(400).json({ message: "OTP is required" });

    const user = req.user;

    if (user.phoneVerified) {
      return res.status(400).json({ message: "Phone number is already verified." });
    }

    if (!user.phoneOtp || !user.phoneOtpExpires) {
      return res.status(400).json({ message: "No OTP found. Please request a new one." });
    }

    if (user.phoneOtpExpires < Date.now()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    // Trim OTP to remove any whitespace
    const trimmedOtp = otp.toString().trim();
    const hashedOtp = crypto.createHash("sha256").update(trimmedOtp).digest("hex");

    console.log("\n=== OTP VERIFICATION ===");
    console.log(`Received OTP: "${trimmedOtp}"`);
    console.log(`Stored hash: ${user.phoneOtp}`);
    console.log(`Generated hash: ${hashedOtp}`);
    console.log(`Match: ${user.phoneOtp === hashedOtp}`);
    console.log("=======================\n");

    if (user.phoneOtp !== hashedOtp) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    await User.findByIdAndUpdate(user._id, {
      $set: { phoneVerified: true },
      $unset: { phoneOtp: "", phoneOtpExpires: "" }
    });

    return res.json({ message: "Phone number verified successfully." });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/auth/resend-otp-phone  (protected)
exports.resendOtpPhone = async (req, res) => {
  try {
    const user = req.user;

    if (user.phoneVerified) {
      return res.status(400).json({ message: "Phone number is already verified." });
    }

    const otp = await generateAndSavePhoneOtp(user._id);

    // For development: log OTP to console
    console.log("\n=== PHONE VERIFICATION OTP (CONSOLE) ===");
    console.log(`OTP for ${user.phoneNumber}: ${otp}`);
    console.log("========================================\n");

    return res.json({ message: "A new OTP has been sent to your phone number." });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Simple mock login for development/testing purposes
exports.mockLogin = (req, res) => {
  const { username, role } = req.body;
  
  if (!username || !role) {
    return res.status(400).json({ success: false, message: 'Username and role are required' });
  }

  const payload = {
    id: '507f1f77bcf86cd799439011', // Valid 24-character hex ObjectId
    username: username,
    userRole: role // e.g. 'Super Admin' or 'Finance Officer'
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET || 'airlux_secret_key', { expiresIn: '1d' });

  res.json({
    success: true,
    token: token,
    user: payload
  });
};
