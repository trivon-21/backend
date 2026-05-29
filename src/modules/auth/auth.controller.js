const authService = require("./auth.service");
const systemConfigService = require("../super-admin/config/system-config.service");
const LoggingService = require("../../utils/logging-service");

const inferLoginMethod = (identifier = "") => {
  const input = String(identifier || "").trim();
  if (!input) return "UNKNOWN";
  return input.includes("@") ? "EMAIL" : "PHONE";
};

exports.getMaintenanceStatus = async (req, res) => {
  try {
    const config = await systemConfigService.getSystemConfig();

    if (!config) {
      return res.status(500).json({
        success: false,
        message: 'Unable to retrieve system configuration',
      });
    }

    const maintenance = config.maintenance || {};

    // Check if system is under maintenance (instant or scheduled)
    const now = new Date();
    let isUnderMaintenance = maintenance.isActive;
    let maintenanceType = 'instant';

    if (!isUnderMaintenance && maintenance.scheduledStartTime && maintenance.scheduledEndTime) {
      isUnderMaintenance = now >= maintenance.scheduledStartTime && now <= maintenance.scheduledEndTime;
      maintenanceType = 'scheduled';
    } else if (maintenance.scheduledStartTime && maintenance.scheduledEndTime) {
      maintenanceType = 'scheduled';
    }

    return res.json({
      success: true,
      data: {
        maintenance: {
          isActive: isUnderMaintenance,
          type: maintenanceType,
          message: maintenance.message,
          reason: maintenance.reason,
          scheduledStartTime: maintenance.scheduledStartTime,
          scheduledEndTime: maintenance.scheduledEndTime,
        },
      },
    });
  } catch (err) {
    console.error('Error fetching maintenance status:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message,
    });
  }
};

exports.signup = async (req, res) => {
  try {
    const { fullName, email, password, identifier, phoneNumber, firebaseIdToken, firebasePhoneNumber } = req.body;
    const authInput = identifier || email || phoneNumber;

    if (!authInput || !password || !fullName) {
      return res.status(400).json({ message: "fullName, password, and identifier (email or phone) are required" });
    }

    const result = await authService.signup(authInput, fullName, password, {
      firebaseIdToken,
      firebasePhoneNumber,
    });

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
  let authInput = null;

  try {
    const { email, password, rememberMe, identifier, phoneNumber } = req.body;
    authInput = identifier || email || phoneNumber;

    if (!authInput || !password) {
      // Log failed login attempt - missing credentials
      await LoggingService.logActivity({
        userId: null,
        userRole: 'UNKNOWN',
        module: 'AUTH',
        action: 'LOGIN_FAILED',
        actionCategory: 'LOGIN',
        entity: 'User',
        status: 'FAILED',
        reason: 'Missing credentials',
        metadata: {
          missingFields: ['authInput', 'password'],
          loginMethod: inferLoginMethod(authInput),
        },
        request: req,
      }).catch(logErr => console.error('Logging error:', logErr));
      return res.status(400).json({ message: "identifier (email or phone) and password are required" });
    }

    const result = await authService.login(authInput, password, rememberMe !== false);

    // Log successful login
    await LoggingService.logActivity({
      userId: result.user.id,
      userRole: result.user.role,
      module: 'AUTH',
      action: 'LOGIN_SUCCESS',
      actionCategory: 'LOGIN',
      entity: 'User',
      entityId: result.user.id,
      status: 'SUCCESS',
      metadata: {
        loginMethod: inferLoginMethod(authInput),
        rememberMe: rememberMe !== false,
        userRole: result.user.role,
        loginIdentifier: authInput,
        userEmail: result.user.email || null,
        userPhone: result.user.phoneNumber || null,
        userName: result.user.fullName || null,
      },
      request: req,
    }).catch(logErr => console.error('Logging error:', logErr));

    return res.json({
      message: "Login successful",
      token: result.token,
      user: result.user
    });
  } catch (err) {
    const failureMessage = err?.message || 'Authentication failed';

    // Log login errors (invalid credentials, account locked, etc.)
    await LoggingService.logActivity({
      userId: err?.userId || null,
      userRole: err?.userRole || 'UNKNOWN',
      module: 'AUTH',
      action: 'LOGIN_ERROR',
      actionCategory: 'LOGIN',
      entity: 'User',
      status: 'FAILED',
      reason: failureMessage,
      metadata: {
        errorType: err?.code || 'AUTH_ERROR',
        loginMethod: err?.loginMethod || inferLoginMethod(authInput),
        loginIdentifier: err?.loginIdentifier || authInput || null,
        userEmail: err?.userEmail || null,
        userPhone: err?.userPhone || null,
        userName: err?.userName || null,
      },
      request: req,
    }).catch(logErr => console.error('Logging error:', logErr));

    if (failureMessage.includes("Account locked")) {
      return res.status(423).json({ message: failureMessage });
    }
    return res.status(401).json({ message: failureMessage });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    await authService.forgotPassword(email);

    return res.json({ message: "If that email is registered, a reset link has been sent." });
  } catch (err) {
    if (err.message === "RESET_EMAIL_SEND_FAILED" || err.message === "EMAIL_NOT_CONFIGURED") {
      return res.status(503).json({
        message: "Password reset email could not be delivered right now. Please try again later."
      });
    }

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
