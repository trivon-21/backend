const bcrypt = require("bcryptjs");
const User = require("../models/User");

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

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $push: { additionalEmails: { email: email.toLowerCase() } } },
      { returnDocument: 'after' }
    ).select("-passwordHash");

    return res.json({
      message: "Email added",
      additionalEmails: user.additionalEmails
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
