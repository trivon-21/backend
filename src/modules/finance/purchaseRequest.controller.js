const mongoose = require("mongoose");
const { createLog } = require("./auditLog.controller");
const { sendPurchaseApprovalEmail, sendPurchaseRejectionEmail } = require("../shared/notification/email.service");

const getPRModel = () => {
  try { return mongoose.model("L_PurchaseRequest"); }
  catch { return mongoose.model("PurchaseRequest"); }
};

// ── GET pending requests (both your PENDING and team's pending-manager) ────────
exports.getPendingRequests = async (req, res) => {
  try {
    const PR = getPRModel();
    const requests = await PR.find({
      status: { $in: ["PENDING", "pending-manager", "pending-finance"] }
    }).sort({ createdAt: 1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── GET approved requests ─────────────────────────────────────────────────────
exports.getApprovedRequests = async (req, res) => {
  try {
    const PR = getPRModel();
    const requests = await PR.find({
      status: { $in: ["APPROVED", "approved"] }
    }).sort({ approvedAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── GET rejected requests ─────────────────────────────────────────────────────
exports.getRejectedRequests = async (req, res) => {
  try {
    const PR = getPRModel();
    const requests = await PR.find({
      status: { $in: ["REJECTED", "rejected"] }
    }).sort({ rejectedAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── APPROVE request ───────────────────────────────────────────────────────────
exports.approveRequest = async (req, res) => {
  try {
    const PR = getPRModel();
    const request = await PR.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (!["PENDING", "pending-manager", "pending-finance"].includes(request.status))
      return res.status(400).json({ message: "Request already processed" });

    request.status     = "APPROVED";
    request.approvedAt = new Date();
    request.reviewedBy = "Finance Officer";
    request.approvedBy = "Finance Officer";
    // keep totalAmount in sync with totalEstimate (team field)
    if (!request.totalAmount && request.totalEstimate) {
      request.totalAmount = request.totalEstimate;
    }
    await request.save();

    const requestRef = request.requestId || `PR-${request._id.toString().slice(-6).toUpperCase()}`;

    await createLog({
      eventType:     "PURCHASE_REQUEST_APPROVED",
      paymentType:   "PURCHASE_REQUEST",
      orderId:       requestRef,
      customerName:  request.requestedBy || "Inventory Manager",
      customerEmail: request.requestedByEmail || "",
      amount:        request.totalAmount || request.totalEstimate || 0,
      performedBy:   "Finance Officer",
      notes:         request.reason || request.notes || "",
    });

    if (request.requestedByEmail) {
      await sendPurchaseApprovalEmail(
        request.requestedByEmail,
        request.requestedBy || "Inventory Manager",
        requestRef,
        request.totalAmount || request.totalEstimate || 0
      );
    }

    res.json({ message: "Purchase request approved", request });
  } catch (error) {
    console.error("approveRequest error:", error);
    res.status(500).json({ message: "Approval failed", error: error.message });
  }
};

// ── REJECT request ────────────────────────────────────────────────────────────
exports.rejectRequest = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) return res.status(400).json({ message: "Rejection reason required" });

    const PR = getPRModel();
    const request = await PR.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (!["PENDING", "pending-manager", "pending-finance"].includes(request.status))
      return res.status(400).json({ message: "Request already processed" });

    request.status          = "REJECTED";
    request.rejectionReason = rejectionReason;
    request.rejectedAt      = new Date();
    request.reviewedBy      = "Finance Officer";
    if (!request.totalAmount && request.totalEstimate) {
      request.totalAmount = request.totalEstimate;
    }
    await request.save();

    const requestRef = request.requestId || `PR-${request._id.toString().slice(-6).toUpperCase()}`;

    await createLog({
      eventType:      "PURCHASE_REQUEST_REJECTED",
      paymentType:    "PURCHASE_REQUEST",
      orderId:        requestRef,
      customerName:   request.requestedBy || "Inventory Manager",
      customerEmail:  request.requestedByEmail || "",
      amount:         request.totalAmount || request.totalEstimate || 0,
      rejectionReason,
      performedBy:    "Finance Officer",
      notes:          request.reason || request.notes || "",
    });

    if (request.requestedByEmail) {
      await sendPurchaseRejectionEmail(
        request.requestedByEmail,
        request.requestedBy || "Inventory Manager",
        requestRef,
        rejectionReason
      );
    }

    res.json({ message: "Purchase request rejected", request });
  } catch (error) {
    console.error("rejectRequest error:", error);
    res.status(500).json({ message: "Rejection failed", error: error.message });
  }
};