const Feedback = require("../models/Feedback");

// GET /api/feedback
exports.getFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.find({ customer: req.user._id }).sort({ createdAt: -1 });
    return res.json(feedback);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/feedback
exports.createFeedback = async (req, res) => {
  try {
    const {
      feedbackFor,
      referenceId,
      referenceLabel,
      productQuality,
      technicianBehavior,
      serviceQuality,
      deliveryExperience,
      comment,
      imageUrl
    } = req.body;

    if (!feedbackFor) {
      return res.status(400).json({ message: "Feedback category is required" });
    }

    const ratingFields = [productQuality, technicianBehavior, serviceQuality, deliveryExperience];
    const hasRating = ratingFields.some((r) => r !== undefined && r !== null);
    if (!hasRating) {
      return res.status(400).json({ message: "At least one rating is required" });
    }

    const feedback = await Feedback.create({
      customer: req.user._id,
      feedbackFor,
      referenceId: referenceId || null,
      referenceLabel: referenceLabel || "",
      productQuality: productQuality || null,
      technicianBehavior: technicianBehavior || null,
      serviceQuality: serviceQuality || null,
      deliveryExperience: deliveryExperience || null,
      comment: comment || "",
      imageUrl: imageUrl || ""
    });

    return res.status(201).json({ message: "Feedback submitted successfully", feedback });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};
