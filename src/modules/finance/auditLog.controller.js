const mongoose = require("mongoose");
const AuditLog = require("../shared/audit/auditLog.model");

exports.createLog = async (data) => {
  try {
    await AuditLog.create(data);
  } catch (error) {
    console.error("Audit log creation failed:", error.message);
  }
};

exports.getLogs = async (req, res) => {
  try {
    const { paymentType, eventType, search, startDate, endDate, page = 1, limit = 20 } = req.query;

    const query = {};
    if (paymentType && paymentType !== "ALL") query.paymentType = paymentType;
    if (eventType   && eventType   !== "ALL") query.eventType   = eventType;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate)   query.createdAt.$lte = new Date(new Date(endDate).setHours(23,59,59,999));
    }

    if (search) {
      query.$or = [
        { customerName:  { $regex: search, $options: "i" } },
        { orderId:       { $regex: search, $options: "i" } },
        { ticketId:      { $regex: search, $options: "i" } },
        { invoiceId:     { $regex: search, $options: "i" } },
        { customerEmail: { $regex: search, $options: "i" } },
      ];
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await AuditLog.countDocuments(query);
    const logs  = await AuditLog.find(query)
      .sort({ createdAt: 1 })   // ← oldest first
      .skip(skip)
      .limit(parseInt(limit));

    // Enrich: resolve customer name + build performedByDisplay
    let User = null;
    try { User = mongoose.model("User"); } catch {}

    const enriched = await Promise.all(logs.map(async (log) => {
      const obj = log.toObject();

      if (obj.customerId && User && (!obj.customerName || obj.customerName === "Unknown")) {
        try {
          const user = await User.findById(obj.customerId);
          if (user) obj.customerName = `${user.fullName || ""} ${user.lastName || ""}`.trim();
        } catch {}
      }

      obj.performedByDisplay = (obj.performedBy === "Customer")
        ? (obj.customerName || "Customer")
        : (obj.performedBy || "Finance Officer");

      return obj;
    }));

    res.json({ logs: enriched, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error("getLogs error:", error);
    res.status(500).json({ message: "Failed to fetch audit logs", error: error.message });
  }
};

exports.getLog = async (req, res) => {
  try {
    const log = await AuditLog.findById(req.params.id);
    if (!log) return res.status(404).json({ message: "Log not found" });
    res.json(log);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch log", error: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const total    = await AuditLog.countDocuments();
    const approved = await AuditLog.countDocuments({ eventType: { $in: ["PAYMENT_APPROVED","SERVICE_PAYMENT_APPROVED","INVOICE_ACCEPTED","INVOICE_PAID"] } });
    const rejected = await AuditLog.countDocuments({ eventType: { $in: ["PAYMENT_REJECTED","SERVICE_PAYMENT_REJECTED","INVOICE_REJECTED","INVOICE_AUTO_CANCELLED"] } });
    res.json({ total, approved, rejected, pending: 0 });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch stats", error: error.message });
  }
};
