/**
 * Feedback Service (Shared)
 * Used by Customer, CSA, Manager roles
 */
const Feedback = require('../../../models/Feedback');

const VALID_CATEGORIES = ['Order', 'Installation', 'Service', 'AMC Service Visit'];
const RATING_FIELDS = ['productQuality', 'technicianBehavior', 'serviceQuality', 'deliveryExperience'];

function canonicalFeedbackInput(input = {}) {
  const category = input.feedbackFor || input.category;
  if (!category || !VALID_CATEGORIES.includes(category)) {
    const error = new Error('Valid feedback category is required (Order, Installation, Service, AMC Service Visit)');
    error.statusCode = 400;
    error.code = 'INVALID_CATEGORY';
    throw error;
  }

  const result = {
    feedbackFor: category,
  };

  if (input.referenceId) result.referenceId = input.referenceId;
  if (input.referenceLabel) result.referenceLabel = String(input.referenceLabel).trim();
  if (input.comment) result.comment = String(input.comment).trim();
  if (input.imageUrl || input.attachment) result.imageUrl = input.imageUrl || input.attachment;

  let ratingCount = 0;
  for (const field of RATING_FIELDS) {
    const val = input[field] !== undefined ? input[field] : (input.ratings && input.ratings[field]);
    if (val !== undefined && val !== null && val !== '') {
      const num = Number(val);
      if (!Number.isInteger(num) || num < 1 || num > 5) {
        const error = new Error(`Rating for ${field} must be from 1 to 5`);
        error.statusCode = 400;
        error.code = 'INVALID_RATING';
        throw error;
      }
      result[field] = num;
      ratingCount += 1;
    }
  }

  if (ratingCount === 0) {
    const error = new Error('Feedback requires at least one rating between 1 and 5');
    error.statusCode = 400;
    error.code = 'RATING_REQUIRED';
    throw error;
  }

  return result;
}

async function getUserFeedback(userId, pagination = {}) {
  try {
    const { limit = 10, skip = 0 } = pagination;
    const query = { $or: [{ customer: userId }, { customerId: userId }] };

    const feedback = await Feedback.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Feedback.countDocuments(query);

    return { feedback, total, limit, skip };
  } catch (err) {
    throw new Error(`Failed to fetch user feedback: ${err.message}`);
  }
}

async function createFeedback(userId, feedbackData) {
  try {
    const canonical = canonicalFeedbackInput(feedbackData);
    const feedback = await Feedback.create({
      ...canonical,
      customer: userId,
    });
    return feedback;
  } catch (err) {
    throw err;
  }
}

async function getServiceRating30d(fromDate = new Date()) {
  const date = new Date(fromDate);
  const thirtyDaysAgo = new Date(date.getTime() - 30 * 24 * 60 * 60 * 1000);

  const pipeline = [
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo },
      },
    },
    {
      $project: {
        rating: { $ifNull: ['$serviceQuality', '$ratings.serviceQuality'] },
      },
    },
    {
      $match: {
        rating: { $gte: 1, $lte: 5 },
      },
    },
    {
      $group: {
        _id: null,
        average: { $avg: '$rating' },
        responseCount: { $sum: 1 },
      },
    },
  ];

  const results = await Feedback.aggregate(pipeline);
  if (!results || results.length === 0) {
    return { average: 0, responseCount: 0 };
  }

  const rawAvg = Number(results[0].average || 0);
  const responseCount = Number(results[0].responseCount || 0);
  const average = Math.round(rawAvg * 10) / 10;

  return { average, responseCount };
}

async function getAllFeedback(filters = {}, pagination = {}) {
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
}

async function getFeedbackStats(dateRange = {}) {
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
          avgProductQuality: { $avg: { $ifNull: ['$productQuality', '$ratings.productQuality'] } },
          avgTechnicianBehavior: { $avg: { $ifNull: ['$technicianBehavior', '$ratings.technicianBehavior'] } },
          avgServiceQuality: { $avg: { $ifNull: ['$serviceQuality', '$ratings.serviceQuality'] } },
          avgDeliveryExperience: { $avg: { $ifNull: ['$deliveryExperience', '$ratings.deliveryExperience'] } },
        },
      },
    ]);

    return stats[0] || {};
  } catch (err) {
    throw new Error(`Failed to get feedback stats: ${err.message}`);
  }
}

module.exports = {
  VALID_CATEGORIES,
  RATING_FIELDS,
  canonicalFeedbackInput,
  getUserFeedback,
  createFeedback,
  getServiceRating30d,
  getAllFeedback,
  getFeedbackStats,
};
