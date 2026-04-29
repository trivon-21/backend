const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../../models/User");

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Sign JWT token
 */
function signToken(user, rememberMe = true) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    secret,
    { expiresIn: rememberMe ? (process.env.JWT_EXPIRES_IN || "7d") : "24h" }
  );
}

/**
 * Identify if input is email or phone
 */
function identifyAuthType(identifier) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^0\d{9}$/; // Sri Lankan format

  if (emailRegex.test(identifier)) {
    return "email";
  } else if (phoneRegex.test(identifier)) {
    return "phone";
  }
  return "invalid";
}

/**
 * Normalize phone number
 */
function normalizePhoneNumber(phoneNumber) {
  const cleaned = phoneNumber.trim().replace(/[\s\-]/g, "");
  if (cleaned.startsWith("0")) {
    return "+94" + cleaned.substring(1);
  }
  return cleaned;
}

/**
 * Login with email or phone
 */
exports.login = async (authInput, password, rememberMe = true) => {
  const authType = identifyAuthType(authInput);
  if (authType === "invalid") {
    throw new Error("Invalid email or phone number format");
  }

  let user;
  if (authType === "email") {
    const normalizedEmail = authInput.toLowerCase();
    user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      user = await User.findOne({
        additionalEmails: { $elemMatch: { email: normalizedEmail, verified: true } }
      });
    }
  } else {
    const normalizedPhone = normalizePhoneNumber(authInput);
    user = await User.findOne({ phoneNumber: normalizedPhone });
  }

  if (!user) throw new Error("Invalid credentials");

  // Check if account is locked
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new Error(`Account locked. Try again in ${minutesLeft} minutes.`);
  }

  const ok = await bcrypt.compare(password, user.passwordHash);

  if (!ok) {
    const newAttempts = (user.loginAttempts || 0) + 1;
    const updates = { loginAttempts: newAttempts };

    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      updates.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
      updates.loginAttempts = 0;
      await User.findByIdAndUpdate(user._id, { $set: updates });
      throw new Error("Account locked for 15 minutes.");
    }

    await User.findByIdAndUpdate(user._id, { $set: updates });
    const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;
    throw new Error(`Invalid credentials. ${remaining} attempts remaining.`);
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
      phoneNumber: user.phoneNumber,
      role: user.role
    }
  };
};
