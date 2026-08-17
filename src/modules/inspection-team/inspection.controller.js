const mongoose = require("mongoose");
const InspectionTicket = require("../shared/ticket/InspectionTicket.model");
const InspectionReport = require("./InspectionReport.model");
const { sendArrivalEmail, sendReportToTechnician } = require("../shared/notification/email.service");

const getOrderModel = () => {
  try { return mongoose.model("Order"); }
  catch {
    const s = new mongoose.Schema({ orderRef: String, customer: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, itemName: String, quantity: Number, amount: Number, orderType: String }, { strict: false, timestamps: true });
    return mongoose.model("Order", s);
  }
};

const getUserModel = () => {
  try { return mongoose.model("User"); }
  catch {
    const s = new mongoose.Schema({ fullName: String, lastName: String, email: String, phoneNumber: String, role: String, address: String }, { strict: false, timestamps: true });
    return mongoose.model("User", s);
  }
};

// ── GET scheduled inspections ─────────────────────────────────────────────────
exports.getScheduledInspections = async (req, res) => {
  try {
    const tickets = await InspectionTicket.find({ status: "INSPECTION_SCHEDULED" }).sort({ scheduledDate: 1 });
    const Order = getOrderModel();
    const User = getUserModel();
    const formatted = await Promise.all(tickets.map(async (t) => {
      const order = await Order.findById(t.orderId);
      const user = await User.findById(t.customerId);
      return {
        _id: t._id,
        orderId: order?.orderRef || t.orderId,
        ticketId: `I-Tic-${t._id.toString().slice(-5).toUpperCase()}`,
        customerName: user ? `${user.fullName} ${user.lastName}`.trim() : "Unknown",
        customerEmail: user?.email || "",
        customerPhone: user?.phoneNumber || "",
        customerAddress: user?.address || "",
        inspectionDate: t.scheduledDate,
        itemName: order?.itemName || "",
        orderAmount: order?.amount || 0,
      };
    }));
    res.json(formatted);
  } catch (error) {
    console.error("getScheduledInspections error:", error);
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── START inspection ──────────────────────────────────────────────────────────
exports.startInspection = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { arrivalTime } = req.body;

    if (!arrivalTime) return res.status(400).json({ message: "Arrival time is required" });

    const ticket = await InspectionTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    ticket.status = "ONGOING";
    ticket.startedAt = new Date();
    await ticket.save();

    const Order = getOrderModel();
    const User = getUserModel();
    const order = await Order.findById(ticket.orderId);
    const user = await User.findById(ticket.customerId);

    if (user?.email) {
      await sendArrivalEmail(
        user.email,
        user.fullName || "Customer",
        order?.orderRef || ticket.orderId.toString(),
        ticket.scheduledDate,
        arrivalTime
      );
    }

    res.json({ message: "Inspection started. Email sent to customer.", ticket });
  } catch (error) {
    console.error("startInspection error:", error);
    res.status(500).json({ message: "Failed to start inspection", error: error.message });
  }
};

// ── GET ongoing inspections ───────────────────────────────────────────────────
exports.getOngoingInspections = async (req, res) => {
  try {
    const tickets = await InspectionTicket.find({ status: "ONGOING" }).sort({ startedAt: -1 });
    const Order = getOrderModel();
    const User = getUserModel();
    const formatted = await Promise.all(tickets.map(async (t) => {
      const order = await Order.findById(t.orderId);
      const user = await User.findById(t.customerId);
      const report = await InspectionReport.findOne({ ticketId: t._id });
      return {
        _id: t._id,
        orderId: order?.orderRef || t.orderId,
        ticketId: `I-Tic-${t._id.toString().slice(-5).toUpperCase()}`,
        customerName: user ? `${user.fullName} ${user.lastName}`.trim() : "Unknown",
        customerEmail: user?.email || "",
        inspectionDate: t.scheduledDate,
        recorded: t.status === "REPORT_RECORDED",
        reportId: report?._id || null,
        // Pre-fill data for report
        prefill: {
          customerName: user ? `${user.fullName} ${user.lastName}`.trim() : "",
          contactNumber: user?.phoneNumber || "",
          siteAddress: user?.address || "",
          inspectionDate: t.scheduledDate?.toISOString().split("T")[0] || "",
          orderId: order?._id || null,
        }
      };
    }));
    res.json(formatted);
  } catch (error) {
    console.error("getOngoingInspections error:", error);
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── SAVE / UPDATE report ──────────────────────────────────────────────────────
exports.saveReport = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const reportData = req.body;

    const ticket = await InspectionTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    let report = await InspectionReport.findOne({ ticketId });

    if (report) {
      Object.assign(report, reportData);
      await report.save();
    } else {
      report = await InspectionReport.create({ ticketId, orderId: ticket.orderId, ...reportData });
    }

    res.json({ message: "Report saved", report });
  } catch (error) {
    console.error("saveReport error:", error);
    res.status(500).json({ message: "Failed to save report", error: error.message });
  }
};

// ── RECORD report (finalize) ──────────────────────────────────────────────────
exports.recordReport = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const reportData = req.body;

    const ticket = await InspectionTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    let report = await InspectionReport.findOne({ ticketId });
    if (report) {
      Object.assign(report, reportData, { status: "RECORDED", recordedAt: new Date() });
      await report.save();
    } else {
      report = await InspectionReport.create({
        ticketId, orderId: ticket.orderId, ...reportData,
        status: "RECORDED", recordedAt: new Date()
      });
    }

    ticket.status = "REPORT_RECORDED";
    ticket.inspectedAt = new Date();
    await ticket.save();

    res.json({ message: "Report recorded successfully", report });
  } catch (error) {
    console.error("recordReport error:", error);
    res.status(500).json({ message: "Failed to record report", error: error.message });
  }
};

// ── GET completed inspections ─────────────────────────────────────────────────
exports.getCompletedInspections = async (req, res) => {
  try {
    const tickets = await InspectionTicket.find({ status: { $in: ["REPORT_RECORDED", "INSPECTED"] } }).sort({ inspectedAt: -1 });
    const Order = getOrderModel();
    const User = getUserModel();
    const formatted = await Promise.all(tickets.map(async (t) => {
      const order = await Order.findById(t.orderId);
      const user = await User.findById(t.customerId);
      const report = await InspectionReport.findOne({ ticketId: t._id });
      return {
        _id: t._id,
        orderId: order?.orderRef || t.orderId,
        ticketId: `I-Tic-${t._id.toString().slice(-5).toUpperCase()}`,
        customerName: user ? `${user.fullName} ${user.lastName}`.trim() : "Unknown",
        inspectionDate: t.scheduledDate,
        reportStatus: report?.status || "DRAFT",
        reportId: report?._id || null,
        submitted: report?.status === "SUBMITTED",
      };
    }));
    res.json(formatted);
  } catch (error) {
    console.error("getCompletedInspections error:", error);
    res.status(500).json({ message: "Failed to fetch", error: error.message });
  }
};

// ── GET report by ticket ──────────────────────────────────────────────────────
exports.getReport = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const report = await InspectionReport.findOne({ ticketId });
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(report);
  } catch (error) {
    console.error("getReport error:", error);
    res.status(500).json({ message: "Failed to fetch report", error: error.message });
  }
};

// ── SUBMIT report to main technician ─────────────────────────────────────────
exports.submitReport = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const report = await InspectionReport.findOne({ ticketId });
    if (!report) return res.status(404).json({ message: "Report not found" });

    const ticket = await InspectionTicket.findById(ticketId);
    const Order = getOrderModel();
    const User = getUserModel();
    const order = await Order.findById(ticket?.orderId);

    // Get main technician email from env or hardcode for now
    const techEmail = process.env.MAIN_TECH_EMAIL || process.env.EMAIL_USER;

    await sendReportToTechnician(
      techEmail,
      report,
      order?.orderRef || ticketId,
      `I-Tic-${ticketId.toString().slice(-5).toUpperCase()}`
    );

    report.status = "SUBMITTED";
    report.submittedAt = new Date();
    await report.save();

    if (ticket) {
      ticket.status = "INSPECTED";
      await ticket.save();
    }

    res.json({ message: "Report submitted to Main Technician", report });
  } catch (error) {
    console.error("submitReport error:", error);
    res.status(500).json({ message: "Failed to submit report", error: error.message });
  }
};

// ── GET dashboard stats ───────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    const [ongoing, scheduled, completed, submitted] = await Promise.all([
      InspectionTicket.countDocuments({ status: { $in: ["ONGOING", "REPORT_RECORDED"] } }),
      InspectionTicket.countDocuments({ status: "INSPECTION_SCHEDULED" }),
      InspectionTicket.countDocuments({ status: { $in: ["REPORT_RECORDED", "INSPECTED"] } }),
      InspectionReport.countDocuments({ status: "SUBMITTED" }),
    ]);

    const allTickets = await InspectionTicket.find({
      status: { $in: ["ONGOING", "REPORT_RECORDED", "INSPECTION_SCHEDULED", "INSPECTED"] }
    }).sort({ updatedAt: -1 }).limit(20);

    const Order = getOrderModel();
    const User = getUserModel();

    const tableData = await Promise.all(allTickets.map(async (t) => {
      const order = await Order.findById(t.orderId);
      const user = await User.findById(t.customerId);
      return {
        _id: t._id,
        orderId: order?.orderRef || t.orderId,
        ticketId: `I-Tic-${t._id.toString().slice(-5).toUpperCase()}`,
        customer: user ? `${user.fullName} ${user.lastName}`.trim() : "Unknown",
        date: t.scheduledDate || t.updatedAt,
        status: t.status,
      };
    }));

    res.json({ ongoing, scheduled, completed, submitted, tableData });
  } catch (error) {
    console.error("getDashboardStats error:", error);
    res.status(500).json({ message: "Failed to fetch stats", error: error.message });
  }
};