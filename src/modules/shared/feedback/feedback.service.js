/**
 * Feedback Service (Shared)
 * Used by Customer, CSA, Manager roles
 */
const Feedback = require("../../../models/Feedback");

exports.getUserFeedback = async (userId, pagination = {}) => {
  try {
    const { limit = 10, skip = 0 } = pagination;

    const feedback = await Feedback.find({ customerId: userId })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Feedback.countDocuments({ customerId: userId });

    return { feedback, total, limit, skip };
  } catch (err) {
    throw new Error(`Failed to fetch user feedback: ${err.message}`);
  }
};

exports.createFeedback = async (userId, feedbackData) => {
  try {
    const {
      category,
      referenceId,
      productQuality,
      technicianBehavior,
      serviceQuality,
      deliveryExperience,
      comment,
      attachment
    } = feedbackData;

    const feedback = await Feedback.create({
      customerId: userId,
      category,
      referenceId,
      ratings: {
        productQuality: productQuality || 0,
        technicianBehavior: technicianBehavior || 0,
        serviceQuality: serviceQuality || 0,
        deliveryExperience: deliveryExperience || 0
      },
      comment,
      attachment,
      createdAt: new Date()
    });

    return feedback;
  } catch (err) {
    throw new Error(`Failed to create feedback: ${err.message}`);
  }
};

exports.getAllFeedback = async (filters = {}, pagination = {}) => {
  try {
    const { limit = 50, skip = 0 } = pagination;

    const feedback = await Feedback.find(filters)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Feedback.countDocuments(filters);

    return { feedback, total, limit, skip };
  } catch (err) {
    throw new Error(`Failed to fetch feedback: ${err.message}`);
  }
};

exports.getFeedbackStats = async (dateRange = {}) => {
  try {
    const { startDate, endDate } = dateRange;
    const matchStage = {};

    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const stats = await Feedback.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalFeedback: { $sum: 1 },
          avgProductQuality: { $avg: "$ratings.productQuality" },
          avgTechnicianBehavior: { $avg: "$ratings.technicianBehavior" },
          avgServiceQuality: { $avg: "$ratings.serviceQuality" },
          avgDeliveryExperience: { $avg: "$ratings.deliveryExperience" }
        }
      }
    ]);

    return stats[0] || {};
  } catch (err) {
    throw new Error(`Failed to get feedback stats: ${err.message}`);
  }
};
