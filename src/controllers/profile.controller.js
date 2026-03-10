const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  });
}

async function generateAdditionalEmailOtp(userId, emailId) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
  await User.findOneAndUpdate(
    { _id: userId, "additionalEmails._id": emailId },
    {
      $set: {
        "additionalEmails.$.otp": hashedOtp,
        "additionalEmails.$.otpExpires": new Date(Date.now() + 10 * 60 * 1000)
      }
    }
  );
  return otp;
}

async function sendAdditionalEmailOtp(toEmail, userName, otp) {
  console.log("\n=== ADDITIONAL EMAIL VERIFICATION OTP ===");
  console.log(`OTP for ${toEmail}: ${otp}`);
  console.log("=========================================\n");

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: `AirLux <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: "AirLux — Verify Your Additional Email",
        html: `
          <p>Hi ${userName},</p>
          <p>Your verification code for <strong>${toEmail}</strong> is:</p>
          <h2 style="letter-spacing:6px;font-size:32px;">${otp}</h2>
          <p>This code expires in <strong>10 minutes</strong>.</p>
          <p>If you did not add this email to your AirLux account, please ignore this email.</p>
        `
      });
    } catch (emailErr) {
      console.error("Failed to send additional email OTP:", emailErr.message);
    }
  }
}

// GET /api/user/profile
exports.getProfile = async (req, res) => {
  try {
    const user = req.user;
    return res.json({
      id: user._id,
      fullName: user.fullName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      gender: user.gender,
      address: user.address,
      phoneNumber: user.phoneNumber,
      profilePhoto: user.profilePhoto,
      additionalEmails: user.additionalEmails,
      emailVerified: user.emailVerified || false,
      createdAt: user.createdAt
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PUT /api/user/profile
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, lastName, gender, address, phoneNumber } = req.body;

    const updates = {};
    if (fullName !== undefined) updates.fullName = fullName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (gender !== undefined) updates.gender = gender;
    if (address !== undefined) updates.address = address;
    if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { returnDocument: 'after', runValidators: true }
    ).select("-passwordHash");

    return res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        fullName: user.fullName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        gender: user.gender,
        address: user.address,
        phoneNumber: user.phoneNumber,
        profilePhoto: user.profilePhoto,
        additionalEmails: user.additionalEmails,
        emailVerified: user.emailVerified || false,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/user/profile/emails
exports.addEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const normalizedEmail = email.toLowerCase().trim();

    // Check if email is already the primary email of any account
    const existingPrimary = await User.findOne({ email: normalizedEmail });
    if (existingPrimary) {
      return res.status(409).json({ message: "This email is already registered to an account." });
    }

    // Check if email is already an additional email on any account
    const existingAdditional = await User.findOne({
      "additionalEmails.email": normalizedEmail
    });
    if (existingAdditional) {
      return res.status(409).json({ message: "This email is already associated with an account." });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $push: { additionalEmails: { email: normalizedEmail, verified: false } } },
      { returnDocument: 'after' }
    ).select("-passwordHash");

    const newEntry = user.additionalEmails.find(ae => ae.email === normalizedEmail);

    const otp = await generateAdditionalEmailOtp(user._id, newEntry._id);
    await sendAdditionalEmailOtp(normalizedEmail, user.fullName, otp);

    return res.json({
      message: "Email added. A verification code has been sent to the new email address.",
      additionalEmails: user.additionalEmails,
      newEmailId: newEntry._id
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// DELETE /api/user/profile/emails/:emailId
exports.removeEmail = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { additionalEmails: { _id: req.params.emailId } } },
      { returnDocument: 'after' }
    ).select("-passwordHash");

    return res.json({
      message: "Email removed",
      additionalEmails: user.additionalEmails
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/user/profile/emails/:emailId/verify
exports.verifyAdditionalEmail = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: "OTP is required" });

    const user = await User.findById(req.user._id);
    const emailEntry = user.additionalEmails.id(req.params.emailId);

    if (!emailEntry) {
      return res.status(404).json({ message: "Email address not found." });
    }

    if (emailEntry.verified) {
      return res.status(400).json({ message: "This email is already verified." });
    }

    if (!emailEntry.otp || !emailEntry.otpExpires) {
      return res.status(400).json({ message: "No OTP found. Please request a new one." });
    }

    if (emailEntry.otpExpires < Date.now()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
    if (emailEntry.otp !== hashedOtp) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    await User.findOneAndUpdate(
      { _id: req.user._id, "additionalEmails._id": req.params.emailId },
      {
        $set: { "additionalEmails.$.verified": true },
        $unset: { "additionalEmails.$.otp": "", "additionalEmails.$.otpExpires": "" }
      }
    );

    const updatedUser = await User.findById(req.user._id).select("-passwordHash");
    return res.json({
      message: "Email verified successfully.",
      additionalEmails: updatedUser.additionalEmails
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/user/profile/emails/:emailId/resend-otp
exports.resendAdditionalEmailOtp = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const emailEntry = user.additionalEmails.id(req.params.emailId);

    if (!emailEntry) {
      return res.status(404).json({ message: "Email address not found." });
    }

    if (emailEntry.verified) {
      return res.status(400).json({ message: "This email is already verified." });
    }

    const otp = await generateAdditionalEmailOtp(user._id, emailEntry._id);
    await sendAdditionalEmailOtp(emailEntry.email, user.fullName, otp);

    return res.json({ message: "A new verification code has been sent to the email address." });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// DELETE /api/user/profile/account
exports.deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    return res.json({ message: "Account deleted successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/user/profile/change-password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }

    const user = await User.findById(req.user._id);
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Current password is incorrect" });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await User.findByIdAndUpdate(req.user._id, { $set: { passwordHash } });
    return res.json({ message: "Password changed successfully" });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PUT /api/user/profile/photo
exports.uploadPhoto = async (req, res) => {
  try {
    const { photo } = req.body;
    if (!photo) return res.status(400).json({ message: "Photo data is required" });

    // Accept base64 data URLs (e.g. "data:image/jpeg;base64,...")
    if (!photo.startsWith("data:image/")) {
      return res.status(400).json({ message: "Invalid image format. Must be a base64 data URL." });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { profilePhoto: photo } },
      { returnDocument: "after" }
    ).select("-passwordHash");

    return res.json({
      message: "Profile photo updated",
      profilePhoto: user.profilePhoto
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};
