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
    res.status(500).json({ message: "Create failed" });
  }
};

// Get pending
exports.getPendingPayments = async (req, res) => {
  const payments = await Payment.find({ status: "PENDING" });
  res.json(payments);
};

// Approve
exports.approvePayment = async (req, res) => {
  try {
    console.log("🔵 Approve endpoint hit");
    console.log("ID received:", req.params.id);

    const payment = await Payment.findById(req.params.id);

    console.log("Payment found:", payment);

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    payment.status = "APPROVED";
    payment.rejectionReason = null;

    await payment.save();

    console.log("✅ Payment updated successfully");

    return res.status(200).json({ message: "Payment approved successfully" });

  } catch (error) {
    console.error("❌ Approve Error:", error);
    return res.status(500).json({
      message: "Approval failed",
      error: error.message
    });
  }
};

// Reject
// Reject
exports.rejectPayment = async (req, res) => {
  try {
    const { rejectionReason } = req.body;

    // Fetch payment
    const payment = await Payment.findById(req.params.id);

    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    // Update payment status and reason
    payment.status = "REJECTED";
    payment.rejectionReason = rejectionReason;
    await payment.save();

    // Record in FinanceReview
    await FinanceReview.create({
      paymentId: payment._id,
      reviewedBy: "Finance Officer", // you can replace with dynamic user if needed
      action: "Rejected",
      comment: rejectionReason,
    });

    // Record in ApprovalLog
    await ApprovalLog.create({
      paymentId: payment._id,
      action: "REJECTED",
      performedBy: "Finance Officer", // replace with dynamic user if available
    });

    // Send rejection email
    await sendRejectionEmail(
      payment.customerEmail,
      payment.orderId,
      rejectionReason
    );

    res.json({ message: "Payment rejected + email sent successfully" });

  } catch (error) {
    console.error("❌ Reject Error:", error); // log actual error
    res.status(500).json({ message: "Rejection failed", error: error.message });
  }
};
/*exports.rejectPayment = async (req, res) => {
  try{
  const { rejectionReason } = req.body;

  const payment = await Payment.findById(req.params.id);
  payment.status = "REJECTED";
  payment.rejectionReason = rejectionReason;
  await payment.save();


    res.json({ message: "Payment rejected successfully" });
  } catch (error) {
    console.error(error); // <-- log the actual error
    res.status(500).json({ message: error.message });
  }
};*/
// Reupload
exports.reuploadSlip = async (req, res) => {
  const { slipUrl } = req.body;

  const payment = await Payment.findById(req.params.id);
  payment.slipUrl = slipUrl;
  payment.status = "PENDING";
  payment.rejectionReason = null;

  await payment.save();

  await ApprovalLog.create({
    paymentId: payment._id,
    action: "REUPLOADED",
    performedBy: "Customer",
  });

  res.json({ message: "Reuploaded" });
};