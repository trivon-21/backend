/**
 * Customer Profile Service
 */
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../../../models/User");

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

exports.getProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  return {
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
    phoneVerified: user.phoneVerified || false,
    authMethods: user.authMethods || ['email'],
    createdAt: user.createdAt
  };
};

exports.updateProfile = async (userId, { fullName, lastName, gender, address, phoneNumber }) => {
  const updates = {};
  if (fullName !== undefined) updates.fullName = fullName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (gender !== undefined) updates.gender = gender;
  if (address !== undefined) updates.address = address;
  if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updates },
    { returnDocument: 'after', runValidators: true }
  ).select("-passwordHash");

  if (!user) throw new Error("User not found");

  return {
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
      phoneVerified: user.phoneVerified || false,
      authMethods: user.authMethods || ['email'],
      createdAt: user.createdAt
    }
  };
};

exports.addEmail = async (userId, { email }) => {
  const normalizedEmail = email.toLowerCase().trim();

  // Check if email is already the primary email
  const existingPrimary = await User.findOne({ email: normalizedEmail });
  if (existingPrimary) throw new Error("Email already registered to an account");

  // Check if email is already an additional email
  const existingAdditional = await User.findOne({
    "additionalEmails.email": normalizedEmail
  });
  if (existingAdditional) throw new Error("Email already associated with an account");

  const user = await User.findByIdAndUpdate(
    userId,
    { $push: { additionalEmails: { email: normalizedEmail, verified: false } } },
    { returnDocument: 'after' }
  ).select("-passwordHash");

  const newEntry = user.additionalEmails.find(ae => ae.email === normalizedEmail);
  const otp = await generateAdditionalEmailOtp(user._id, newEntry._id);
  await sendAdditionalEmailOtp(normalizedEmail, user.fullName, otp);

  return {
    message: "Email added. A verification code has been sent.",
    additionalEmails: user.additionalEmails,
    newEmailId: newEntry._id
  };
};

exports.removeEmail = async (userId, emailId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $pull: { additionalEmails: { _id: emailId } } },
    { returnDocument: 'after' }
  ).select("-passwordHash");

  return {
    message: "Email removed",
    additionalEmails: user.additionalEmails
  };
};

exports.verifyAdditionalEmail = async (userId, emailId, otp) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const emailEntry = user.additionalEmails.id(emailId);
  if (!emailEntry) throw new Error("Email address not found");
  if (emailEntry.verified) throw new Error("Email already verified");
  if (!emailEntry.otp || !emailEntry.otpExpires) throw new Error("No OTP found");
  if (emailEntry.otpExpires < Date.now()) throw new Error("OTP has expired");

  const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
  if (emailEntry.otp !== hashedOtp) throw new Error("Invalid OTP");

  await User.findOneAndUpdate(
    { _id: userId, "additionalEmails._id": emailId },
    {
      $set: { "additionalEmails.$.verified": true },
      $unset: { "additionalEmails.$.otp": "", "additionalEmails.$.otpExpires": "" }
    }
  );

  const updatedUser = await User.findById(userId).select("-passwordHash");
  return {
    message: "Email verified successfully",
    additionalEmails: updatedUser.additionalEmails
  };
};

exports.resendAdditionalEmailOtp = async (userId, emailId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const emailEntry = user.additionalEmails.id(emailId);
  if (!emailEntry) throw new Error("Email address not found");
  if (emailEntry.verified) throw new Error("Email already verified");

  const otp = await generateAdditionalEmailOtp(user._id, emailEntry._id);
  await sendAdditionalEmailOtp(emailEntry.email, user.fullName, otp);

  return { message: "A new verification code has been sent" };
};

exports.deleteAccount = async (userId) => {
  await User.findByIdAndDelete(userId);
  return { message: "Account deleted successfully" };
};

exports.changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new Error("Current password is incorrect");

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  await User.findByIdAndUpdate(userId, { $set: { passwordHash } });
  return { message: "Password changed successfully" };
};

exports.changePasswordFirstLogin = async (userId, { newPassword }) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  // Generate OTP for email verification
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

  // Update user with new password and OTP for email verification
  await User.findByIdAndUpdate(userId, {
    $set: {
      passwordHash,
      needsPasswordChange: false,
      emailOtp: hashedOtp,
      emailOtpExpires: new Date(Date.now() + 10 * 60 * 1000)
    }
  });

  // Send OTP email
  if (user.email) {
    const transporter = createTransporter();
    try {
      await transporter.sendMail({
        from: `AirLux <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: "AirLux — Verify Your Email",
        html: `
          <p>Hi ${user.fullName},</p>
          <p>Your email verification code is:</p>
          <h2 style="letter-spacing:6px;font-size:32px;">${otp}</h2>
          <p>This code expires in <strong>10 minutes</strong>.</p>
          <p>If you did not create an AirLux account, please ignore this email.</p>
        `
      });
      console.log(`[DEV] Email OTP for ${user.email}: ${otp}`);
    } catch (emailErr) {
      console.error("Failed to send email verification OTP:", emailErr.message);
    }
  }

  return {
    message: "Password changed successfully",
    requiresEmailVerification: true,
    userEmail: user.email
  };
};

exports.uploadPhoto = async (userId, { profilePhoto }) => {
  if (!profilePhoto.startsWith("data:image/")) {
    throw new Error("Invalid image format. Must be a base64 data URL");
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { profilePhoto } },
    { returnDocument: "after" }
  ).select("-passwordHash");

  if (!user) throw new Error("User not found");

  return {
    message: "Profile photo updated",
    profilePhoto: user.profilePhoto
  };
};

exports.removePhoto = async (userId) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $unset: { profilePhoto: "" } },
    { returnDocument: "after" }
  ).select("-passwordHash");

  if (!user) throw new Error("User not found");

  return {
    message: "Profile photo removed",
    profilePhoto: null
  };
};
