const authService = require("./auth.service");

exports.signup = async (req, res) => {
  try {
    const { fullName, email, password, identifier, phoneNumber } = req.body;
    const authInput = identifier || email || phoneNumber;

    if (!authInput || !password || !fullName) {
      return res.status(400).json({ message: "fullName, password, and identifier (email or phone) are required" });
    }

    const result = await authService.signup(authInput, fullName, password);

    return res.status(201).json({
      message: "Signup successful",
      token: result.token,
      user: result.user
    });
  } catch (err) {
    return res.status(err.message.includes("already registered") ? 409 : 400).json({
      message: err.message
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, rememberMe, identifier, phoneNumber } = req.body;
    const authInput = identifier || email || phoneNumber;

    if (!authInput || !password) {
      return res.status(400).json({ message: "identifier (email or phone) and password are required" });
    }

    const result = await authService.login(authInput, password, rememberMe !== false);

    return res.json({
      message: "Login successful",
      token: result.token,
      user: result.user
    });
  } catch (err) {
    if (err.message.includes("Account locked")) {
      return res.status(423).json({ message: err.message });
    }
    return res.status(401).json({ message: err.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    await authService.forgotPassword(email);

    return res.json({ message: "If that email is registered, a reset link has been sent." });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) return res.status(400).json({ message: "Password is required" });

    await authService.resetPassword(token, password);

    return res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: "OTP is required" });

    await authService.verifyEmail(req.user._id, otp);

    return res.json({ message: "Email verified successfully." });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.resendOtp = async (req, res) => {
  try {
    await authService.resendEmailOtp(req.user._id);
    return res.json({ message: "A new OTP has been sent to your email." });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.verifyPhone = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ message: "OTP is required" });

    await authService.verifyPhone(req.user._id, otp);

    return res.json({ message: "Phone number verified successfully." });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.resendOtpPhone = async (req, res) => {
  try {
    await authService.resendPhoneOtp(req.user._id);
    return res.json({ message: "A new OTP has been sent to your phone number." });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};
