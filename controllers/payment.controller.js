const Payment = require("../models/Payment.model");
const FinanceReview = require("../models/FinanceReview");
const ApprovalLog = require("../models/ApprovalLog");
const { sendRejectionEmail } = require("../services/email.service");

// Create payment
exports.createPayment = async (req, res) => {
  try {
    const payment = await Payment.create(req.body);
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ message: "Create failed", error: err.message });
  }
};

// Get pending
exports.getPendingPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ status: "PENDING" });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch pending payments", error: error.message });
  }
};

// Approve
exports.approvePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    payment.status = "APPROVED";
    payment.rejectionReason = null;
    await payment.save();

    await ApprovalLog.create({
      paymentId: payment._id,
      action: "APPROVED",
      performedBy: "Finance Officer",
    });

    res.status(200).json({ message: "Payment approved successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Approval failed", error: error.message });
  }
};

// Reject
exports.rejectPayment = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    payment.status = "REJECTED";
    payment.rejectionReason = rejectionReason;
    await payment.save();

    await FinanceReview.create({
      paymentId: payment._id,
      reviewedBy: "Finance Officer",
      action: "Rejected",
      comment: rejectionReason,
    });

    await ApprovalLog.create({
      paymentId: payment._id,
      action: "REJECTED",
      performedBy: "Finance Officer",
    });

    await sendRejectionEmail(payment.customerEmail, payment.orderId, rejectionReason);

    res.json({ message: "Payment rejected + email sent successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Rejection failed", error: error.message });
  }
};

// Reupload slip (auto reset REJECTED → PENDING)
exports.reuploadSlip = async (req, res) => {
  try {
    const { slipUrl } = req.body;
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    payment.slipUrl = slipUrl;
    payment.status = "PENDING";        // Reset status
    payment.rejectionReason = null;    // Clear rejection
    await payment.save();

    await ApprovalLog.create({
      paymentId: payment._id,
      action: "REUPLOADED",
      performedBy: "Customer",
    });

    res.json({ message: "Slip reuploaded successfully", payment });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Reupload failed", error: error.message });
  }
};

// Get approved payments
exports.getApprovedPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ status: "APPROVED" }).sort({ updatedAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch approved payments", error: error.message });
  }
};

// Get rejected payments
exports.getRejectedPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ status: "REJECTED" }).sort({ updatedAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch rejected payments", error: error.message });
  }
};