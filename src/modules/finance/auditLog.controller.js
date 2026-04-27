const AuditLog = require("../shared/audit/auditLog.model");

// Create a log entry — called internally by other controllers
exports.createLog = async (data) => {
  try {
    await AuditLog.create(data);
  } catch (error) {
    console.error("Audit log creation failed:", error.message);
  }
};

// GET all logs with optional filters
exports.getLogs = async (req, res) => {
  try {
    const { paymentType, eventType, search, startDate, endDate, page = 1, limit = 20 } = req.query;

    const query = {};

    if (paymentType && paymentType !== "ALL") query.paymentType = paymentType;
    if (eventType && eventType !== "ALL") query.eventType = eventType;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: "i" } },
        { orderId: { $regex: search, $options: "i" } },
        { ticketId: { $regex: search, $options: "i" } },
        { invoiceId: { $regex: search, $options: "i" } },
        { customerEmail: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({ logs, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error("getLogs error:", error);
    res.status(500).json({ message: "Failed to fetch audit logs", error: error.message });
  }
};

// GET single log
exports.getLog = async (req, res) => {
  try {
    const log = await AuditLog.findById(req.params.id);
    if (!log) return res.status(404).json({ message: "Log not found" });
    res.json(log);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch log", error: error.message });
  }
};

// GET summary stats
exports.getStats = async (req, res) => {
  try {
    const total = await AuditLog.countDocuments();
    const approved = await AuditLog.countDocuments({ eventType: { $in: ["PAYMENT_APPROVED", "SERVICE_PAYMENT_APPROVED", "INVOICE_ACCEPTED", "INVOICE_PAID"] } });
    const rejected = await AuditLog.countDocuments({ eventType: { $in: ["PAYMENT_REJECTED", "SERVICE_PAYMENT_REJECTED", "INVOICE_REJECTED", "INVOICE_AUTO_CANCELLED"] } });
    const pending = await AuditLog.countDocuments({ eventType: { $in: ["PAYMENT_SUBMITTED", "SERVICE_PAYMENT_SUBMITTED"] } });
    res.json({ total, approved, rejected, pending });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch stats", error: error.message });
  }
};