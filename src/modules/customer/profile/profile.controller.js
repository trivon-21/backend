/**
 * Customer Profile Controller
 */
const profileService = require("./profile.service");

exports.getProfile = async (req, res) => {
  try {
    const profile = await profileService.getProfile(req.user._id);
    return res.json(profile);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const result = await profileService.updateProfile(req.user._id, req.body);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.addEmail = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const result = await profileService.addEmail(req.user._id, { email });
    return res.json(result);
  } catch (err) {
    const status = err.message.includes("already") ? 409 : 400;
    return res.status(status).json({ message: err.message });
  }
};

exports.removeEmail = async (req, res) => {
  try {
    const result = await profileService.removeEmail(req.user._id, req.params.emailId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.verifyAdditionalEmail = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: "OTP is required" });

    const result = await profileService.verifyAdditionalEmail(req.user._id, req.params.emailId, otp);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.resendAdditionalEmailOtp = async (req, res) => {
  try {
    const result = await profileService.resendAdditionalEmailOtp(req.user._id, req.params.emailId);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const result = await profileService.deleteAccount(req.user._id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }

    const result = await profileService.changePassword(req.user._id, { currentPassword, newPassword });
    return res.json(result);
  } catch (err) {
    return res.status(err.message.includes("incorrect") ? 401 : 500).json({ message: err.message });
  }
};

exports.uploadPhoto = async (req, res) => {
  try {
    const { profilePhoto } = req.body;
    if (!profilePhoto) return res.status(400).json({ message: "Photo data is required" });

    const result = await profileService.uploadPhoto(req.user._id, { profilePhoto });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.removePhoto = async (req, res) => {
  try {
    const result = await profileService.removePhoto(req.user._id);
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};
