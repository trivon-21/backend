const Feedback = require("../models/Feedback");
const feedbackService = require("../modules/shared/feedback/feedback.service");
const configCache = require("../utils/config-cache");

// GET /api/customer/feedback
exports.getFeedbacks = async (req, res) => {
  try {
    const result = await feedbackService.getUserFeedback(req.user._id, {
      limit: parseInt(req.query.limit) || 50,
      skip: parseInt(req.query.skip) || 0
    });
    return res.json(result.feedback);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/customer/feedback
exports.createFeedback = async (req, res) => {
  try {
    // Check feature flag if customerFeedbackEnabled
    try {
      const flags = await configCache.getFeatureFlags();
      if (flags && flags.customerFeedbackEnabled === false) {
        return res.status(403).json({
          success: false,
          message: "Customer feedback submissions are currently disabled",
        });
      }
    } catch (flagErr) {
      // If config cache fails, proceed gracefully
    }

    const feedback = await feedbackService.createFeedback(req.user._id, req.body);

    return res.status(201).json({
      message: "Feedback submitted successfully",
      feedback
    });
  } catch (err) {
    const status = err.statusCode || (err.name === "ValidationError" ? 400 : 500);
    return res.status(status).json({
      message: err.message || "Failed to submit feedback",
      code: err.code
    });
  }
};
