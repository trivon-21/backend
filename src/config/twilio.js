const twilio = require("twilio");

let client = null;

function initializeTwilio() {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !twilioPhoneNumber) {
      console.error(
        "❌ Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in .env",
      );
      return;
    }

    client = twilio(accountSid, authToken);
    console.log("✅ Twilio SMS initialized successfully");
  } catch (error) {
    console.error("❌ Twilio initialization failed:", error.message);
  }
}

/**
 * Send OTP via SMS using Twilio
 * @param {string} phoneNumber - Phone number in format +94XXXXXXXXX
 * @param {string} otp - OTP code
 * @returns {Promise<{success, messageId}>}
 */
async function sendPhoneOtp(phoneNumber, otp) {
  if (!client) {
    throw new Error("Twilio not initialized");
  }

  try {
    const message = await client.messages.create({
      body: `Your AirLux verification code is: ${otp}. This code expires in 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber,
    });

    console.log(`✅ SMS sent to ${phoneNumber} - Message ID: ${message.sid}`);
    return { success: true, messageId: message.sid, phoneNumber };
  } catch (error) {
    console.error(`❌ Failed to send SMS to ${phoneNumber}:`, error.message);
    throw new Error(`Failed to send OTP via SMS: ${error.message}`);
  }
}

// Initialize Twilio on module load
if (process.env.NODE_ENV !== "test") {
  initializeTwilio();
}

module.exports = { sendPhoneOtp };
