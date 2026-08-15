const Inquiry = require("../models/Inquiry");

// GET /api/inquiries
exports.getInquiries = async (req, res) => {
  try {
    const inquiries = await Inquiry.find({ customer: req.user._id }).sort({ createdAt: -1 });
    return res.json(inquiries);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/inquiries/:id
exports.getInquiry = async (req, res) => {
  try {
    const inquiry = await Inquiry.findOne({ _id: req.params.id, customer: req.user._id });
    if (!inquiry) return res.status(404).json({ message: "Inquiry not found" });
    return res.json(inquiry);
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/inquiries
exports.createInquiry = async (req, res) => {
  try {
    const { name, email, phone, inquiryType, message, attachmentUrl } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ message: "Message is required" });
    }

    const subject = inquiryType ? `[${inquiryType}] ${message.substring(0, 60)}` : message.substring(0, 60);

    const inquiry = await Inquiry.create({
      customer: req.user._id,
      name: name || "",
      email: email || "",
      phone: phone || "",
      inquiryType: inquiryType || "Other",
      subject,
      message: message.trim(),
      attachmentUrl: attachmentUrl || "",
      thread: [{ sender: "Customer", message: message.trim() }],
      status: "Ongoing"
    });

    return res.status(201).json({ message: "Inquiry submitted successfully", inquiry });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};

// POST /api/inquiries/:id/reply
exports.replyToInquiry = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ message: "Message is required" });
    }

    const inquiry = await Inquiry.findOne({ _id: req.params.id, customer: req.user._id });
    if (!inquiry) return res.status(404).json({ message: "Inquiry not found" });

    if (inquiry.status === "Closed") {
      return res.status(400).json({ message: "Cannot reply to a closed inquiry" });
    }

    inquiry.thread.push({ sender: "Customer", message: message.trim() });
    inquiry.status = "Ongoing";
    await inquiry.save();
    return res.json({ message: "Reply sent", inquiry });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};
