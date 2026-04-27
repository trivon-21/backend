const mongoose = require("mongoose");
const cron = require("node-cron");
const InspectionTicket = require("../shared/ticket/InspectionTicket.model");
const { sendRejectionEmail, sendApprovalEmail, sendSchedulingEmail, sendReminderEmail } = require("../shared/notification/email.service");
const { createLog } = require("./auditLog.controller");
const SLOTS_PER_DAY = 4;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4200";

const getOrderModel = () => {
  try { return mongoose.model("Order"); }
  catch {
    const s = new mongoose.Schema({
      orderRef: String, customer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      itemName: String, quantity: Number, amount: Number, orderType: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("Order", s);
  }
};

const getUserModel = () => {
  try { return mongoose.model("User"); }
  catch {
    const s = new mongoose.Schema({
      fullName: String, lastName: String, firstName: String,
      email: String, phoneNumber: String, role: String, address: String,
      name: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("User", s);
  }
};

// Sri Lankan public holidays YYYY-MM-DD for 2026
const PUBLIC_HOLIDAYS = [
  "2026-01-26", // Independence Day
  "2026-02-21", // Maha Shivaratri
  "2026-04-13", // Sinhala & Tamil New Year (Day 1)
  "2026-04-14", // Sinhala & Tamil New Year (Day 2)
  "2026-05-01", // Labour Day
  "2026-05-11", // Vesak Full Moon (Day 1)
  "2026-05-12", // Vesak Full Moon (Day 2)
  "2026-06-29", // Poson Full Moon (Day 1)
  "2026-06-30", // Poson Full Moon (Day 2)
  "2026-08-03", // Nikini Full Moon
  "2026-10-29", // Deepavali
  "2026-11-02", // Ill Full Moon
  "2026-12-25", // Christmas
];

// ── GET or CREATE ticket ──────────────────────────────────────────────────────
exports.getOrCreateTicket = async (req, res) => {
  try {
    const { orderId } = req.params;
    const Order = getOrderModel();
    const User = getUserModel();
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.orderType !== "Buy & Install")
      return res.status(400).json({ message: "This order does not require inspection" });
    const user = await User.findById(order.customer);
    let ticket = await InspectionTicket.findOne({ orderId: order._id });
    if (!ticket) {
      ticket = await InspectionTicket.create({
        orderId: order._id,
        customerId: order.customer,
        status: "PENDING_PAYMENT",
        inspectionFee: 5000,
      });
    }
    res.json({
      ticket,
      order: {
        orderId: order.orderRef || order._id,
        customerName: user ? `${user.fullName} ${user.lastName}`.trim() : "Customer",
        customerEmail: user?.email || "",
        itemName: order.itemName,
        items: [order.itemName],
        quantity: order.quantity,
        amount: order.amount,
        orderType: order.orderType,
      },
      bankDetails: {
        bankName: "Commercial Bank",
        branchName: "Colombo 03",
        accountName: "AirLux Pvt Ltd",
        accountNo: "1234567890",
        inspectionFee: ticket.inspectionFee,
      },
    });
  } catch (error) {
    console.error("getOrCreateTicket error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ── UPLOAD slip ───────────────────────────────────────────────────────────────
exports.uploadSlip = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { slipUrl } = req.body;
    if (!slipUrl) return res.status(400).json({ message: "No slip data received" });
    const ticket = await InspectionTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (!["PENDING_PAYMENT", "PAYMENT_REJECTED"].includes(ticket.status))
      return res.status(400).json({ message: `Cannot upload at stage: ${ticket.status}` });
    ticket.slipUrl = slipUrl;
    ticket.status = "PAYMENT_UNDER_REVIEW";
    ticket.rejectionReason = null;
    ticket.slipUploadedAt = new Date();
    await ticket.save();
    res.json({ message: "Slip uploaded. Payment is under review.", ticket });
  } catch (error) {
    console.error("uploadSlip error:", error);
    res.status(500).json({ message: "Upload failed", error: error.message });
  }
};

// ── GET pending verification ──────────────────────────────────────────────────
exports.getPendingVerification = async (req, res) => {
  try {
    const tickets = await InspectionTicket.find({ status: "PAYMENT_UNDER_REVIEW" }).sort({ updatedAt: -1 });
    const Order = getOrderModel();
    const User = getUserModel();
    const formatted = await Promise.all(tickets.map(async (t) => {
      const order = await Order.findById(t.orderId);
      const user = await User.findById(t.customerId);

      // Fallback: if user not found, try to get customer name from order (if it has customerName field)
      let customerName = "Unknown";
      let customerEmail = "";

      if (user) {
        customerName = `${user.fullName || ""} ${user.lastName || ""}`.trim() || "Unknown";
        customerEmail = user.email || "";
      } else if (order?.customerName) {
        customerName = order.customerName;
        customerEmail = order.customerEmail || "";
      }

      return {
        _id: t._id,
        orderId: order?.orderRef || t.orderId,
        ticketId: `I-Tic-${t._id.toString().slice(-5).toUpperCase()}`,
        customerName: customerName,
        customerEmail: customerEmail,
        amount: t.inspectionFee,
        slipUrl: t.slipUrl,
        status: t.status,
        date: t.slipUploadedAt || t.updatedAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
    }));
    res.json(formatted);
  } catch (error) {
    console.error("getPendingVerification error:", error);
    res.status(500).json({ message: "Failed to fetch tickets", error: error.message });
  }
};

// ── APPROVE payment ───────────────────────────────────────────────────────────
exports.approvePayment = async (req, res) => {
  try {
    const ticket = await InspectionTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    const Order = getOrderModel();
    const User = getUserModel();
    const order = await Order.findById(ticket.orderId);
    const user = await User.findById(ticket.customerId);
    ticket.status = "PAYMENT_CONFIRMED";
    ticket.rejectionReason = null;
    ticket.approvedAt = new Date();
    await ticket.save();
    await createLog({
      eventType: "PAYMENT_APPROVED",
      paymentType: "INSPECTION",
      orderId: order.orderRef || order._id.toString(),
      ticketId: `I-Tic-${ticket._id.toString().slice(-5).toUpperCase()}`,
      customerId: ticket.customerId,
      customerName: user?.fullName || "Unknown",
      customerEmail: user?.email || "",
      amount: ticket.inspectionFee && ticket.inspectionFee > 0 ? ticket.inspectionFee : 5000,
      slipUrl: ticket.slipUrl || null,
      performedBy: "Finance Officer",
    });
    if (user?.email) {
      const schedulingLink = `${FRONTEND_URL}/inspection-scheduling?ticketId=${ticket._id}`;
      await sendApprovalEmail(user.email, order?.orderRef || ticket.orderId, user.fullName || "Customer", schedulingLink);
    }
    res.json({ message: "Inspection payment approved successfully", ticket });
  } catch (error) {
    console.error("approvePayment error:", error);
    res.status(500).json({ message: "Approval failed", error: error.message });
  }
};

// ── REJECT payment ────────────────────────────────────────────────────────────
exports.rejectPayment = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) return res.status(400).json({ message: "Rejection reason required" });
    const ticket = await InspectionTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    const Order = getOrderModel();
    const User = getUserModel();
    const order = await Order.findById(ticket.orderId);
    const user = await User.findById(ticket.customerId);
    ticket.status = "PAYMENT_REJECTED";
    ticket.rejectionReason = rejectionReason;
    ticket.rejectedAt = new Date();
    await ticket.save();
    await createLog({
      eventType: "PAYMENT_REJECTED",
      paymentType: "INSPECTION",
      orderId: order.orderRef || order._id.toString(),
      ticketId: `I-Tic-${ticket._id.toString().slice(-5).toUpperCase()}`,
      customerId: ticket.customerId,
      customerName: user?.fullName || "Unknown",
      customerEmail: user?.email || "",
      amount: ticket.inspectionFee && ticket.inspectionFee > 0 ? ticket.inspectionFee : 5000,
      slipUrl: ticket.slipUrl || null,
      rejectionReason: rejectionReason,
      performedBy: "Finance Officer",
    });
    if (user?.email) {
      const reuploadLink = `${FRONTEND_URL}/inspection-payment?orderId=${ticket.orderId}`;
      await sendRejectionEmail(user.email, order?.orderRef || ticket.orderId.toString(), rejectionReason, reuploadLink);
    }
    res.json({ message: "Payment rejected and email sent", ticket });
  } catch (error) {
    console.error("rejectPayment error:", error);
    res.status(500).json({ message: "Rejection failed", error: error.message });
  }
};

// ── GET verified payments ─────────────────────────────────────────────────────
exports.getVerifiedPayments = async (req, res) => {
  try {
    const tickets = await InspectionTicket.find({
      status: { $in: ["PAYMENT_CONFIRMED", "INSPECTION_SCHEDULED", "INSPECTED"] }
    }).sort({ approvedAt: -1 });
    const Order = getOrderModel();
    const User = getUserModel();
    const formatted = await Promise.all(tickets.map(async (t) => {
      const order = await Order.findById(t.orderId);
      const user = await User.findById(t.customerId);

      // Fallback: if user not found, try to get customer name from order
      let customerName = "Unknown";
      let customerEmail = "";

      if (user) {
        customerName = `${user.fullName || ""} ${user.lastName || ""}`.trim() || "Unknown";
        customerEmail = user.email || "";
      } else if (order?.customerName) {
        customerName = order.customerName;
        customerEmail = order.customerEmail || "";
      }

      return {
        _id: t._id,
        orderId: order?.orderRef || t.orderId,
        ticketId: `I-Tic-${t._id.toString().slice(-5).toUpperCase()}`,
        customerName: customerName,
        customerEmail: customerEmail,
        amount: t.inspectionFee,
        slipUrl: t.slipUrl,
        status: t.status,
        updatedAt: t.approvedAt || t.updatedAt,
      };
    }));
    res.json(formatted);
  } catch (error) {
    console.error("getVerifiedPayments error:", error);
    res.status(500).json({ message: "Failed to fetch verified payments", error: error.message });
  }
};

// ── GET rejected payments ─────────────────────────────────────────────────────
exports.getRejectedPayments = async (req, res) => {
  try {
    const tickets = await InspectionTicket.find({ status: "PAYMENT_REJECTED" }).sort({ rejectedAt: -1 });
    const Order = getOrderModel();
    const User = getUserModel();
    const formatted = await Promise.all(tickets.map(async (t) => {
      const order = await Order.findById(t.orderId);
      const user = await User.findById(t.customerId);

      // Fallback: if user not found, try to get customer name from order
      let customerName = "Unknown";
      let customerEmail = "";

      if (user) {
        customerName = `${user.fullName || ""} ${user.lastName || ""}`.trim() || "Unknown";
        customerEmail = user.email || "";
      } else if (order?.customerName) {
        customerName = order.customerName;
        customerEmail = order.customerEmail || "";
      }

      return {
        _id: t._id,
        orderId: order?.orderRef || t.orderId,
        ticketId: `I-Tic-${t._id.toString().slice(-5).toUpperCase()}`,
        customerName: customerName,
        customerEmail: customerEmail,
        amount: t.inspectionFee,
        slipUrl: t.slipUrl,
        status: t.status,
        rejectionReason: t.rejectionReason,
        updatedAt: t.rejectedAt || t.updatedAt,
      };
    }));
    res.json(formatted);
  } catch (error) {
    console.error("getRejectedPayments error:", error);
    res.status(500).json({ message: "Failed to fetch rejected payments", error: error.message });
  }
};

// ── GET available dates for scheduling ───────────────────────────────────────
exports.getAvailableDates = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const ticket = await InspectionTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    // Allow both initial scheduling and rescheduling
    if (!["PAYMENT_CONFIRMED", "INSPECTION_SCHEDULED"].includes(ticket.status))
      return res.status(400).json({ message: "Cannot schedule at this time" });

    // Start from tomorrow
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + 1);

    const end = new Date(start);
    end.setDate(end.getDate() + 30);

    // Count bookings per day
    const bookings = await InspectionTicket.find({
      status: { $in: ["INSPECTION_SCHEDULED", "ONGOING", "REPORT_RECORDED", "INSPECTED"] },
      scheduledDate: { $gte: start, $lte: end },
    });

    const bookingCounts = {};
    bookings.forEach((b) => {
      if (b.scheduledDate) {
        const dateKey = new Date(b.scheduledDate).toISOString().split("T")[0];
        bookingCounts[dateKey] = (bookingCounts[dateKey] || 0) + 1;
      }
    });

    const calendar = [];
    const current = new Date(start);

    while (current <= end) {
      const dateKey = current.toISOString().split("T")[0];
      const dayOfWeek = current.getDay();
      const isHoliday = PUBLIC_HOLIDAYS.includes(dateKey);
      const isWeekend = dayOfWeek === 6; // Only Saturday (6), Sunday (0) is now available
      const bookingCount = bookingCounts[dateKey] || 0;
      const isFullyBooked = bookingCount >= SLOTS_PER_DAY;

      let status = "available";
      if (isHoliday) status = "holiday";
      else if (isWeekend) status = "unavailable";
      else if (isFullyBooked) status = "fully_booked";

      calendar.push({
        date: dateKey,
        status,
        bookingCount,
        slotsLeft: Math.max(0, SLOTS_PER_DAY - bookingCount),
        isHoliday,
        isWeekend,
        isFullyBooked,
      });

      current.setDate(current.getDate() + 1);
    }

    res.json({
      calendar,
      ticketId: ticket._id,
      alreadyScheduled: ticket.scheduledDate
        ? new Date(ticket.scheduledDate).toISOString().split("T")[0]
        : null,
    });
  } catch (error) {
    console.error("getAvailableDates error:", error);
    res.status(500).json({ message: "Failed to get dates", error: error.message });
  }
};

// ── CONFIRM scheduling ────────────────────────────────────────────────────────
exports.confirmScheduling = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { selectedDate } = req.body;

    if (!selectedDate)
      return res.status(400).json({ message: "Selected date is required" });

    const ticket = await InspectionTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (ticket.status !== "PAYMENT_CONFIRMED")
      return res.status(400).json({ message: "Cannot schedule at this stage" });

    // Check slots available
    const dateStart = new Date(selectedDate);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(selectedDate);
    dateEnd.setHours(23, 59, 59, 999);

    const existingBookings = await InspectionTicket.countDocuments({
      status: { $in: ["INSPECTION_SCHEDULED", "INSPECTED"] },
      scheduledDate: { $gte: dateStart, $lte: dateEnd },
    });

    if (existingBookings >= SLOTS_PER_DAY)
      return res.status(400).json({ message: "This date is fully booked. Please choose another date." });

    // Check holiday
    if (PUBLIC_HOLIDAYS.includes(selectedDate))
      return res.status(400).json({ message: "This date is a public holiday." });

    const day = new Date(selectedDate).getDay();
    if (day === 0 || day === 6)
      return res.status(400).json({ message: "Weekends are not available for inspection." });

    ticket.scheduledDate = new Date(selectedDate);
    ticket.status = "INSPECTION_SCHEDULED";
    ticket.scheduledAt = new Date();
    await ticket.save();

    const Order = getOrderModel();
    const User = getUserModel();
    const order = await Order.findById(ticket.orderId);
    const user = await User.findById(ticket.customerId);

    // Send scheduling confirmation email with reschedule link
    if (user?.email) {
      const rescheduleLink = `${FRONTEND_URL}/inspection-scheduling?ticketId=${ticket._id}&mode=reschedule`;
      await sendSchedulingEmail(
        user.email,
        user.fullName || "Customer",
        order?.orderRef || ticket.orderId.toString(),
        selectedDate,
        ticket._id,
        rescheduleLink
      );
    }

    res.json({ message: "Inspection scheduled successfully", ticket });
  } catch (error) {
    console.error("confirmScheduling error:", error);
    res.status(500).json({ message: "Scheduling failed", error: error.message });
  }
};

// ── CRON: send reminder email 1 day before ────────────────────────────────────
// Runs every day at 8:00 AM
cron.schedule("0 8 * * *", async () => {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayEnd = new Date(tomorrow);
    dayEnd.setHours(23, 59, 59, 999);

    const tickets = await InspectionTicket.find({
      status: "INSPECTION_SCHEDULED",
      scheduledDate: { $gte: tomorrow, $lte: dayEnd },
      reminderSent: false,
    });

    const User = getUserModel();
    const Order = getOrderModel();

    for (const ticket of tickets) {
      const user = await User.findById(ticket.customerId);
      const order = await Order.findById(ticket.orderId);

      if (user?.email) {
        await sendReminderEmail(
          user.email,
          user.fullName || "Customer",
          order?.orderRef || ticket.orderId.toString(),
          ticket.scheduledDate.toISOString().split("T")[0]
        );
        ticket.reminderSent = true;
        await ticket.save();
        console.log(`Reminder sent to ${user.email} for ${ticket.scheduledDate}`);
      }
    }
  } catch (error) {
    console.error("Cron reminder error:", error);
  }
});

// ── RESCHEDULE inspection ─────────────────────────────────────────────────────
// Customer can reschedule up to 1 day before the scheduled inspection
exports.rescheduleInspection = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { newDate } = req.body;

    if (!newDate) {
      return res.status(400).json({ message: "New date is required" });
    }

    const ticket = await InspectionTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.status !== "INSPECTION_SCHEDULED") {
      return res.status(400).json({ message: "Can only reschedule INSPECTION_SCHEDULED inspections" });
    }

    // Check if reschedule is allowed (must be at least 1 day before scheduled inspection)
    const now = new Date();
    const scheduledDate = new Date(ticket.scheduledDate);
    const hoursUntilInspection = (scheduledDate - now) / (1000 * 60 * 60);

    if (hoursUntilInspection < 24) {
      return res.status(400).json({
        message: "You can only reschedule at least 1 day before the inspection date",
        hoursRemaining: Math.max(0, Math.floor(hoursUntilInspection))
      });
    }

    // Validate new date (same checks as initial scheduling)
    const newDateStart = new Date(newDate);
    newDateStart.setHours(0, 0, 0, 0);
    const newDateEnd = new Date(newDate);
    newDateEnd.setHours(23, 59, 59, 999);

    const existingBookings = await InspectionTicket.countDocuments({
      _id: { $ne: ticket._id }, // Don't count current ticket
      status: { $in: ["INSPECTION_SCHEDULED", "INSPECTED"] },
      scheduledDate: { $gte: newDateStart, $lte: newDateEnd },
    });

    if (existingBookings >= SLOTS_PER_DAY) {
      return res.status(400).json({ message: "This date is fully booked. Please choose another date." });
    }

    if (PUBLIC_HOLIDAYS.includes(newDate)) {
      return res.status(400).json({ message: "This date is a public holiday." });
    }

    const dayOfWeek = new Date(newDate).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return res.status(400).json({ message: "Weekends are not available for inspection." });
    }

    // Check that new date is in the future
    const newDateObj = new Date(newDate);
    newDateObj.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (newDateObj <= today) {
      return res.status(400).json({ message: "Cannot schedule in the past." });
    }

    // Update the ticket with new date
    const oldDate = new Date(ticket.scheduledDate);
    ticket.scheduledDate = new Date(newDate);
    ticket.rescheduledFrom = oldDate;
    ticket.rescheduledAt = new Date();
    await ticket.save();

    const Order = getOrderModel();
    const User = getUserModel();
    const order = await Order.findById(ticket.orderId);
    const user = await User.findById(ticket.customerId);

    // Send rescheduling confirmation email
    if (user?.email) {
      const rescheduleLink = `${FRONTEND_URL}/inspection-scheduling?ticketId=${ticket._id}&mode=reschedule`;
      await sendSchedulingEmail(
        user.email,
        user.fullName || "Customer",
        order?.orderRef || ticket.orderId.toString(),
        newDate,
        ticket._id,
        rescheduleLink
      );
    }

    res.json({
      message: "Inspection rescheduled successfully",
      oldDate: oldDate.toISOString().split("T")[0],
      newDate: newDate,
      ticket
    });
  } catch (error) {
    console.error("rescheduleInspection error:", error);
    res.status(500).json({ message: "Rescheduling failed", error: error.message });
  }
};