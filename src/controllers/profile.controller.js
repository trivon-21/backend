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
