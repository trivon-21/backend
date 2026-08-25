const mongoose = require("mongoose");
const { createLog } = require("./auditLog.controller");
const { sendPurchaseApprovalEmail, sendPurchaseRejectionEmail } = require("../shared/notification/email.service");

const getPRModel = () => {
  try { return mongoose.model("L_PurchaseRequest"); }
  catch { return mongoose.model("PurchaseRequest"); }
};

const getUserModel = () => {
  try { return mongoose.model("User"); }
  catch {
    const s = new mongoose.Schema({
      fullName: String, lastName: String, email: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("User", s, "users");
  }
};

// Normalize a request doc so the frontend always finds expected field names
// regardless of whether the real team schema uses different names
const normalizeRequest = (doc) => {
  const obj = doc.toObject ? doc.toObject() : doc;
  obj.totalAmount = obj.totalAmount || obj.totalEstimate || 0;

  if (Array.isArray(obj.items)) {
    obj.items = obj.items.map(item => ({
      ...item,
      itemName:  item.itemName  || item.name     || "",
      unitPrice: item.unitPrice ?? item.unitCost   ?? 0,
      total:     item.total     ?? item.estimatedTotal ?? 0,
    }));
  }

  return obj;
};

// Resolve the requester's email — prefer requestedByEmail (legacy field),
// fall back to looking up the User by requestedById (real team schema field)
const resolveRequesterEmail = async (request) => {
  if (request.requestedByEmail) return request.requestedByEmail;
  if (request.requestedById) {
    try {
      const User = getUserModel();
      const user = await User.findById(request.requestedById);
      if (user?.email) return user.email;
    } catch (e) {
      console.error("resolveRequesterEmail lookup failed:", e.message);
    }
  }
  return "";
};

// Attach resolved email onto a normalized doc for frontend display
const attachEmail = async (normalizedDoc, rawDoc) => {
  normalizedDoc.requestedByEmail = await resolveRequesterEmail(rawDoc);
  return normalizedDoc;
};

// ── GET pending requests ────────────────────────────────────────────────────
exports.getPendingRequests = async (req, res) => {
  try {
    const PR = getPRModel();
    const requests = await PR.find({
      status: { $in: ["PENDING", "pending-manager", "pending-finance"] }
    }).sort({ createdAt: 1 });

    const result = await Promise.all(
      requests.map(async (r) => attachEmail(normalizeRequest(r), r))
    );
    res.json(result);
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

    const result = await Promise.all(
      requests.map(async (r) => attachEmail(normalizeRequest(r), r))
    );
    res.json(result);
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

    const result = await Promise.all(
      requests.map(async (r) => attachEmail(normalizeRequest(r), r))
    );
    res.json(result);
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
    if (!request.totalAmount && request.totalEstimate) {
      request.totalAmount = request.totalEstimate;
    }
    await request.save();

    const requestRef = request.requestId || `PR-${request._id.toString().slice(-6).toUpperCase()}`;
    const requesterEmail = await resolveRequesterEmail(request);

    await createLog({
      eventType:     "PURCHASE_REQUEST_APPROVED",
      paymentType:   "PURCHASE_REQUEST",
      orderId:       requestRef,
      customerName:  request.requestedBy || "Inventory Manager",
      customerEmail: requesterEmail,
      amount:        request.totalAmount || request.totalEstimate || 0,
      performedBy:   "Finance Officer",
      notes:         request.reason || request.notes || "",
    });

    if (requesterEmail) {
      await sendPurchaseApprovalEmail(
        requesterEmail,
        request.requestedBy || "Inventory Manager",
        requestRef,
        request.totalAmount || request.totalEstimate || 0
      );
    }

    res.json({ message: "Purchase request approved", request: await attachEmail(normalizeRequest(request), request) });
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
    const requesterEmail = await resolveRequesterEmail(request);

    await createLog({
      eventType:      "PURCHASE_REQUEST_REJECTED",
      paymentType:    "PURCHASE_REQUEST",
      orderId:        requestRef,
      customerName:   request.requestedBy || "Inventory Manager",
      customerEmail:  requesterEmail,
      amount:         request.totalAmount || request.totalEstimate || 0,
      rejectionReason,
      performedBy:    "Finance Officer",
      notes:          request.reason || request.notes || "",
    });

    if (requesterEmail) {
      await sendPurchaseRejectionEmail(
        requesterEmail,
        request.requestedBy || "Inventory Manager",
        requestRef,
        rejectionReason
      );
    }

    res.json({ message: "Purchase request rejected", request: await attachEmail(normalizeRequest(request), request) });
  } catch (error) {
    console.error("rejectRequest error:", error);
    res.status(500).json({ message: "Rejection failed", error: error.message });
  }
};


/*const mongoose = require("mongoose");
const { createLog } = require("./auditLog.controller");
const { sendPurchaseApprovalEmail, sendPurchaseRejectionEmail } = require("../shared/notification/email.service");

const getPRModel = () => {
  try { return mongoose.model("L_PurchaseRequest"); }
  catch { return mongoose.model("PurchaseRequest"); }
};

const getUserModel = () => {
  try { return mongoose.model("User"); }
  catch {
    const s = new mongoose.Schema({
      fullName: String, lastName: String, email: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("User", s, "users");
  }
};

// Normalize a request doc so the frontend always finds totalAmount regardless
// of whether it's stored as totalAmount (legacy) or totalEstimate (team schema)
const normalizeRequest = (doc) => {
  const obj = doc.toObject ? doc.toObject() : doc;
  obj.totalAmount = obj.totalAmount || obj.totalEstimate || 0;
  return obj;
};

// Resolve the requester's email — prefer requestedByEmail (legacy field),
// fall back to looking up the User by requestedById (real team schema field)
const resolveRequesterEmail = async (request) => {
  if (request.requestedByEmail) return request.requestedByEmail;
  if (request.requestedById) {
    try {
      const User = getUserModel();
      const user = await User.findById(request.requestedById);
      if (user?.email) return user.email;
    } catch (e) {
      console.error("resolveRequesterEmail lookup failed:", e.message);
    }
  }
  return "";
};

// ── GET pending requests ────────────────────────────────────────────────────
exports.getPendingRequests = async (req, res) => {
  try {
    const PR = getPRModel();
    const requests = await PR.find({
      status: { $in: ["PENDING", "pending-manager", "pending-finance"] }
    }).sort({ createdAt: 1 });
    res.json(requests.map(normalizeRequest));
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
    res.json(requests.map(normalizeRequest));
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
    res.json(requests.map(normalizeRequest));
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
    if (!request.totalAmount && request.totalEstimate) {
      request.totalAmount = request.totalEstimate;
    }
    await request.save();

    const requestRef = request.requestId || `PR-${request._id.toString().slice(-6).toUpperCase()}`;
    const requesterEmail = await resolveRequesterEmail(request);

    await createLog({
      eventType:     "PURCHASE_REQUEST_APPROVED",
      paymentType:   "PURCHASE_REQUEST",
      orderId:       requestRef,
      customerName:  request.requestedBy || "Inventory Manager",
      customerEmail: requesterEmail,
      amount:        request.totalAmount || request.totalEstimate || 0,
      performedBy:   "Finance Officer",
      notes:         request.reason || request.notes || "",
    });

    if (requesterEmail) {
      await sendPurchaseApprovalEmail(
        requesterEmail,
        request.requestedBy || "Inventory Manager",
        requestRef,
        request.totalAmount || request.totalEstimate || 0
      );
    }

    res.json({ message: "Purchase request approved", request: normalizeRequest(request) });
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
    const requesterEmail = await resolveRequesterEmail(request);

    await createLog({
      eventType:      "PURCHASE_REQUEST_REJECTED",
      paymentType:    "PURCHASE_REQUEST",
      orderId:        requestRef,
      customerName:   request.requestedBy || "Inventory Manager",
      customerEmail:  requesterEmail,
      amount:         request.totalAmount || request.totalEstimate || 0,
      rejectionReason,
      performedBy:    "Finance Officer",
      notes:          request.reason || request.notes || "",
    });

    if (requesterEmail) {
      await sendPurchaseRejectionEmail(
        requesterEmail,
        request.requestedBy || "Inventory Manager",
        requestRef,
        rejectionReason
      );
    }

    res.json({ message: "Purchase request rejected", request: normalizeRequest(request) });
  } catch (error) {
    console.error("rejectRequest error:", error);
    res.status(500).json({ message: "Rejection failed", error: error.message });
  }
};

*/