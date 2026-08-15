const mongoose = require("mongoose");
const PurchaseRequest = require("../shared/L_purchaseRequest.model");
const { createLog } = require("./auditLog.controller");
const { sendPurchaseApprovalEmail, sendPurchaseRejectionEmail } = require("../shared/notification/email.service");

// ── GET pending requests ──────────────────────────────────────────────────────
exports.getPendingRequests = async (req, res) => {
  try {
    const requests = await PurchaseRequest.find({ status: "PENDING" }).sort({ createdAt: 1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── GET approved requests ─────────────────────────────────────────────────────
exports.getApprovedRequests = async (req, res) => {
  try {
    const requests = await PurchaseRequest.find({ status: "APPROVED" }).sort({ approvedAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── GET rejected requests ─────────────────────────────────────────────────────
exports.getRejectedRequests = async (req, res) => {
  try {
    const requests = await PurchaseRequest.find({ status: "REJECTED" }).sort({ rejectedAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── APPROVE request ───────────────────────────────────────────────────────────
exports.approveRequest = async (req, res) => {
  try {
    const request = await PurchaseRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "PENDING")
      return res.status(400).json({ message: "Request already processed" });

    request.status = "APPROVED";
    request.approvedAt = new Date();
    request.reviewedBy = "Finance Officer";
    await request.save();

    const requestRef = `PR-${request._id.toString().slice(-6).toUpperCase()}`;

    await createLog({
      eventType: "PURCHASE_REQUEST_APPROVED",
      paymentType: "PURCHASE_REQUEST",
      orderId: requestRef,
      customerName: request.requestedBy || "Inventory Manager",
      customerEmail: request.requestedByEmail || "",
      amount: request.totalAmount || 0,
      performedBy: "Finance Officer",
      notes: request.reason || "",
    });

    if (request.requestedByEmail) {
      await sendPurchaseApprovalEmail(
        request.requestedByEmail,
        request.requestedBy || "Inventory Manager",
        requestRef,
        request.totalAmount
      );
    }

    res.json({ message: "Purchase request approved and email sent", request });
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

    const request = await PurchaseRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    if (request.status !== "PENDING")
      return res.status(400).json({ message: "Request already processed" });

    request.status = "REJECTED";
    request.rejectionReason = rejectionReason;
    request.rejectedAt = new Date();
    request.reviewedBy = "Finance Officer";
    await request.save();

    const requestRef = `PR-${request._id.toString().slice(-6).toUpperCase()}`;

    await createLog({
      eventType: "PURCHASE_REQUEST_REJECTED",
      paymentType: "PURCHASE_REQUEST",
      orderId: requestRef,
      customerName: request.requestedBy || "Inventory Manager",
      customerEmail: request.requestedByEmail || "",
      amount: request.totalAmount || 0,
      rejectionReason,
      performedBy: "Finance Officer",
      notes: request.reason || "",
    });

    if (request.requestedByEmail) {
      await sendPurchaseRejectionEmail(
        request.requestedByEmail,
        request.requestedBy || "Inventory Manager",
        requestRef,
        rejectionReason
      );
    }

    res.json({ message: "Purchase request rejected and email sent", request });
  } catch (error) {
    console.error("rejectRequest error:", error);
    res.status(500).json({ message: "Rejection failed", error: error.message });
  }
};