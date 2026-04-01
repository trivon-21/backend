const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Initialize Firebase Admin SDK
let firebase = null;

function initializeFirebase() {
  // Load service account from environment variable or file
  const serviceAccountPath =
    process.env.FIREBASE_CREDENTIALS ||
    path.join(__dirname, "../../firebase-credentials.json");

  let serviceAccount;

  try {
    if (fs.existsSync(serviceAccountPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
    } else {
      // Try loading from environment variable (for CI/CD)
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
    }

    if (!serviceAccount.project_id) {
      throw new Error("Firebase service account not configured");
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });

    firebase = admin.auth();
    console.log("Firebase Admin SDK initialized successfully");
  } catch (error) {
    console.error("Firebase initialization failed:", error.message);
    console.log(
      "Make sure firebase-credentials.json exists or FIREBASE_SERVICE_ACCOUNT env var is set"
    );
  }
}

/**
 * Send OTP to phone number using Firebase Authentication
 * @param {string} phoneNumber - E.g., "+14155552671"
 * @returns {Promise<{sessionId, code}>} - Returns sessionId and verification code for testing
 */
async function sendPhoneOtp(phoneNumber) {
  if (!firebase) {
    throw new Error("Firebase not initialized");
  }

  // Note: Firebase Authentication expects phone sign-in to be handled via the web SDK on the client side
  // This is a backend helper to generate test OTPs for development/testing
  // In production, the frontend handles phone sign-in with reCAPTCHA

  try {
    // For testing: Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    console.log(`[DEV] Phone OTP for ${phoneNumber}: ${otp}`);
    // In production with Firebase, you would use:
    // const phoneSignInResult = await firebase.verifyPhoneNumber(phoneNumber);

    return {
      otp, // Only for testing/development
      phoneNumber,
      sessionId: Date.now().toString() // Placeholder session ID
    };
  } catch (error) {
    throw new Error(`Failed to send phone OTP: ${error.message}`);
  }
}

/**
 * Verify phone OTP (simplified for backend verification)
 * In production, Firebase handles this on the client side
 */
async function verifyPhoneOtp(phoneNumber, otp) {
  if (!firebase) {
    throw new Error("Firebase not initialized");
  }

  // Note: In production, phone verification happens on client with Firebase SDK
  // This is a backend helper for OTP validation
  try {
    // Backend simply validates the OTP format (6 digits)
    if (!/^\d{6}$/.test(otp)) {
      throw new Error("Invalid OTP format");
    }
    return { valid: true, phoneNumber };
  } catch (error) {
    throw new Error(`OTP verification failed: ${error.message}`);
  }
}

// Initialize Firebase on module load
if (process.env.NODE_ENV !== "test") {
  initializeFirebase();
}

module.exports = {
  initializeFirebase,
  sendPhoneOtp,
  verifyPhoneOtp
};
