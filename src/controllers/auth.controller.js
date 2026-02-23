const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function signToken(user, rememberMe = true) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: rememberMe ? (process.env.JWT_EXPIRES_IN || "7d") : "24h" }
  );
}

// POST /api/auth/signup
exports.signup = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Email already registered" });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      fullName,
      email: email.toLowerCase(),
      passwordHash,
      role: "CUSTOMER"
    });

    const token = signToken(user);

    return res.status(201).json({
      message: "Signup successful",
      token,
      user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role }
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
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

    return res.json({
      message: "Login successful",
      token,
      user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role }
    });
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