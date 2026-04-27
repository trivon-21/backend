/**
 * Inquiry Service (Shared)
 * Used by Customer, CSA roles
 */
const Inquiry = require("../../../models/Inquiry");

exports.getUserInquiries = async (userId, pagination = {}) => {
  try {
    const { limit = 10, skip = 0 } = pagination;

    const inquiries = await Inquiry.find({ customerId: userId })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Inquiry.countDocuments({ customerId: userId });

    return { inquiries, total, limit, skip };
  } catch (err) {
    throw new Error(`Failed to fetch user inquiries: ${err.message}`);
  }
};

exports.getInquiryById = async (inquiryId, userId) => {
  try {
    const inquiry = await Inquiry.findOne({ _id: inquiryId, customerId: userId });
    if (!inquiry) throw new Error("Inquiry not found or unauthorized");
    return inquiry;
  } catch (err) {
    throw new Error(`Failed to fetch inquiry: ${err.message}`);
  }
};

exports.createInquiry = async (userId, { subject, inquiryType, description }) => {
  try {
    const inquiry = await Inquiry.create({
      inquiryRef: `INQ-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      customerId: userId,
      subject,
      inquiryType,
      description,
      status: 'Ongoing',
      thread: [{
        sender: 'Customer',
        message: description,
        attachments: [],
        timestamp: new Date()
      }]
    });

    return inquiry;
  } catch (err) {
    throw new Error(`Failed to create inquiry: ${err.message}`);
  }
};

exports.replyToInquiry = async (inquiryId, userId, { message, attachments = [] }) => {
  try {
    const inquiry = await Inquiry.findOne({ _id: inquiryId, customerId: userId });
    if (!inquiry) throw new Error("Inquiry not found or unauthorized");

    const reply = {
      sender: 'Customer',
      message,
      attachments,
      timestamp: new Date()
    };

    const updated = await Inquiry.findByIdAndUpdate(
      inquiryId,
      { $push: { thread: reply } },
      { new: true }
    );

    return updated;
  } catch (err) {
    throw new Error(`Failed to reply to inquiry: ${err.message}`);
  }
};

exports.getAllInquiries = async (filters = {}, pagination = {}) => {
  try {
    const { limit = 50, skip = 0 } = pagination;

    const inquiries = await Inquiry.find(filters)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Inquiry.countDocuments(filters);

    return { inquiries, total, limit, skip };
  } catch (err) {
    throw new Error(`Failed to fetch inquiries: ${err.message}`);
  }
};
