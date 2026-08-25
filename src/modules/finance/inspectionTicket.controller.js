const mongoose = require("mongoose");
const cron = require("node-cron");
const Holidays = require("date-holidays");
const {
  sendApprovalEmail,
  sendRejectionEmail,
  sendSchedulingEmail,
  sendReminderEmail,
} = require("../shared/notification/email.service");
const { createLog } = require("./auditLog.controller");

const SLOTS_PER_DAY = 4;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4200";

// ── Model loaders ─────────────────────────────────────────────────────────────
const getTicketModel = () => {
  try { return mongoose.model("InspectionTicket"); }
  catch {
    const s = new mongoose.Schema({
      ticketRef:      String,
      orderId:        mongoose.Schema.Types.ObjectId,
      customerId:     mongoose.Schema.Types.ObjectId,
      status:         String,
      inspectionFee:  Number,
      slipUrl:        String,
      slipUploadedAt: Date,
      approvedAt:     Date,
      rejectedAt:     Date,
      rejectionReason:String,
      scheduledDate:  Date,
      scheduledAt:    Date,
      reminderSent:   Boolean,
    }, { strict: false, timestamps: true });
    return mongoose.model("InspectionTicket", s, "inspection_tickets");
  }
};

const getUserModel = () => {
  try { return mongoose.model("User"); }
  catch {
    const s = new mongoose.Schema({
      fullName: String, lastName: String, email: String,
      phoneNumber: String, role: String, address: String,
    }, { strict: false, timestamps: true });
    return mongoose.model("User", s, "users");
  }
};

const getOrderModel = () => {
  const s = new mongoose.Schema({
    orderReference: String,
    userId:   mongoose.Schema.Types.ObjectId,
    items: Array,
    subtotal: Number, total: Number,
    inspectionFee: Number,
    status: String,
    consultationCompleted: Boolean,
  }, { strict: false, timestamps: true });

  const modelName = "InstallationOrderInspectionLookup";
  return mongoose.models[modelName] || mongoose.model(modelName, s, "installation_orders");
};

const holidayCache = new Map();
const holidayProvider = new Holidays("LK");

async function loadPublicHolidays(year) {
  if (holidayCache.has(year)) {
    return holidayCache.get(year);
  }

  const holidays = holidayProvider.getHolidays(year) || [];
  const dates = holidays
    .map((holiday) => holiday && holiday.date && holiday.date.slice(0, 10))
    .filter(Boolean);
  holidayCache.set(year, dates);
  return dates;
}

// ── Helper: get a readable ticket reference, with legacy fallback ─────────────
function getTicketDisplayRef(ticket) {
  return ticket.ticketRef || `I-Tic-${ticket._id.toString().slice(-5).toUpperCase()}`;
}
async function resolveOrderRefForTicket(ticket, Order) {
  if (!ticket.orderId) return null;
  try {
    const order = await Order.findById(ticket.orderId);
    return order?.orderReference || order?.orderRef || null;
  } catch {
    return null;
  }
}

// ── Charge helper — handles team's full charge names ──────────────────────────
const getLCharge = async (name) => {
  try {
    let LCharge;
    try { LCharge = mongoose.model("L_Charge"); }
    catch { LCharge = mongoose.model("Charge"); }

    let charge = await LCharge.findOne({ name });
    if (charge) return charge.amount;

    const keyMap = {
      "inspection":           /inspection/i,
      "installation":         /installation/i,
      "repair_minor":         /minor.repair|repair.*minor/i,
      "repair_major":         /major.repair|repair.*major/i,
      "profit_margin_inventory": /profit|margin/i,
    };
    if (keyMap[name]) {
      charge = await LCharge.findOne({ name: { $regex: keyMap[name] } });
      if (charge) return charge.amount;
    }
    return null;
  } catch { return null; }
};

// ── Bank details helper — handles team field names ────────────────────────────
const getBankDetails = async () => {
  try {
    let BankDetail;
    try { BankDetail = mongoose.model("BankDetail"); }
    catch { BankDetail = mongoose.model("L_BankDetail"); }

    const bd = await BankDetail.findOne();
    if (bd) return {
      bankName:    bd.bankName    || "Commercial Bank",
      branchName:  bd.branch      || bd.branchName || "Colombo 03",
      accountName: bd.accountName || "AirLux Pvt Ltd",
      accountNo:   bd.accountNumber || bd.accountNo || "1234567890",
    };
  } catch (e) {
    console.error("getBankDetails error:", e.message);
  }
  return {
    bankName:    "Commercial Bank",
    branchName:  "Colombo 03",
    accountName: "AirLux Pvt Ltd",
    accountNo:   "1234567890",
  };
};

// ── GET or CREATE inspection ticket ──────────────────────────────────────────
exports.getOrCreateTicket = async (req, res) => {
  try {
    const { orderId } = req.params;
    const InspectionTicket = getTicketModel();
    const Order = getOrderModel();
    const User = getUserModel();

    const order = await Order.findById(orderId);

    if (!order) return res.status(404).json({ message: "Order not found" });

    const customerId = order.customer || order.userId;
    const user = customerId ? await User.findById(customerId) : null;

    let ticket = await InspectionTicket.findOne({ orderId });

    if (!ticket) {
      const currentFee = await getLCharge("inspection") || 2500;
      ticket = await InspectionTicket.create({
        orderId,
        customerId,
        status:        "PENDING_PAYMENT",
        inspectionFee: currentFee,
      });
    }

    const bank = await getBankDetails();

    res.json({
      ticket,
      order: {
        orderId:       order.orderRef || order.orderReference || order._id,
        customerName:  user ? `${user.fullName || ""} ${user.lastName || ""}`.trim() : "Customer",
        customerEmail: user?.email || "",
        itemName:      order.itemName || (order.items?.[0]?.name) || "",
        items:         order.items || [order.itemName],
        quantity:      order.quantity || order.items?.[0]?.quantity || 1,
        amount:        order.subtotal || order.items?.[0]?.price || order.amount || order.total || 0,
        orderType:     order.orderType || "Buy & Install",
      },
      bankDetails: {
        bankName:      bank.bankName,
        branchName:    bank.branchName,
        accountName:   bank.accountName,
        accountNo:     bank.accountNo,
        inspectionFee: ticket.inspectionFee,
      },
    });
  } catch (error) {
    console.error("getOrCreateTicket error:", error);
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── UPLOAD slip ───────────────────────────────────────────────────────────────
exports.uploadSlip = async (req, res) => {
  try {
    const { slipUrl } = req.body;
    if (!slipUrl) return res.status(400).json({ message: "Slip URL required" });

    const InspectionTicket = getTicketModel();
    const ticket = await InspectionTicket.findByIdAndUpdate(
      req.params.ticketId,
      { slipUrl, slipUploadedAt: new Date(), status: "PAYMENT_UNDER_REVIEW" },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    await createLog({
      eventType:  "PAYMENT_SUBMITTED",
      paymentType:"INSPECTION",
      ticketId:   getTicketDisplayRef(ticket),
      customerId: ticket.customerId,
      amount:     ticket.inspectionFee || 0,
      slipUrl,
      performedBy:"Customer",
    });

    res.json({ message: "Slip uploaded successfully", ticket });
  } catch (error) {
    res.status(500).json({ message: "Failed to upload slip", error: error.message });
  }
};

// ── GET pending verification ──────────────────────────────────────────────────
exports.getPendingVerification = async (req, res) => {
  try {
    const InspectionTicket = getTicketModel();
    const User = getUserModel();
    const Order = getOrderModel();

    const tickets = await InspectionTicket.find({
      status: "PAYMENT_UNDER_REVIEW"
    }).sort({ createdAt: 1 });

    const enriched = await Promise.all(tickets.map(async (t) => {
      const obj = t.toObject();
      obj.ticketId = getTicketDisplayRef(t);
      obj.orderRef = await resolveOrderRefForTicket(t, Order);
      if (t.customerId) {
        const user = await User.findById(t.customerId);
        if (user) obj.customerName = `${user.fullName || ""} ${user.lastName || ""}`.trim();
      }
      obj.amount = t.inspectionFee;
      return obj;
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── APPROVE payment ───────────────────────────────────────────────────────────
exports.approvePayment = async (req, res) => {
  try {
    const InspectionTicket = getTicketModel();
    const User = getUserModel();
    const Order = getOrderModel();

    const ticket = await InspectionTicket.findByIdAndUpdate(
      req.params.id,
      { status: "PAYMENT_CONFIRMED", approvedAt: new Date() },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const user = ticket.customerId ? await User.findById(ticket.customerId) : null;
    const customerName  = user ? `${user.fullName || ""} ${user.lastName || ""}`.trim() : "Customer";
    const customerEmail = user?.email || "";

    const order = ticket.orderId ? await Order.findById(ticket.orderId) : null;
    const orderRef = order?.orderReference || order?.orderRef || ticket.orderId?.toString() || "N/A";

    await createLog({
      eventType:     "PAYMENT_APPROVED",
      paymentType:   "INSPECTION",
      ticketId:      getTicketDisplayRef(ticket),
      customerId:    ticket.customerId,
      customerName,
      customerEmail,
      amount:        ticket.inspectionFee || 0,
      performedBy:   "Finance Officer",
    });

    const schedulingLink = `${FRONTEND_URL}/inspection-scheduling?ticketId=${ticket._id}`;
    if (customerEmail) {
      await sendApprovalEmail(customerEmail, orderRef, customerName, schedulingLink);
    }

    res.json({ message: "Payment approved", ticket });
  } catch (error) {
    res.status(500).json({ message: "Failed to approve", error: error.message });
  }
};

// ── REJECT payment ────────────────────────────────────────────────────────────
exports.rejectPayment = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason) return res.status(400).json({ message: "Reason required" });

    const InspectionTicket = getTicketModel();
    const User = getUserModel();
    const Order = getOrderModel();

    const ticket = await InspectionTicket.findByIdAndUpdate(
      req.params.id,
      { status: "PAYMENT_REJECTED", rejectionReason, rejectedAt: new Date() },
      { new: true }
    );
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const user = ticket.customerId ? await User.findById(ticket.customerId) : null;
    const customerName  = user ? `${user.fullName || ""} ${user.lastName || ""}`.trim() : "Customer";
    const customerEmail = user?.email || "";

    const order = ticket.orderId ? await Order.findById(ticket.orderId) : null;
    const orderRef = order?.orderReference || order?.orderRef || ticket.orderId?.toString() || "N/A";

    await createLog({
      eventType:      "PAYMENT_REJECTED",
      paymentType:    "INSPECTION",
      ticketId:       getTicketDisplayRef(ticket),
      customerId:     ticket.customerId,
      customerName,
      customerEmail,
      amount:         ticket.inspectionFee || 0,
      rejectionReason,
      performedBy:    "Finance Officer",
    });

    const reUploadLink = `${FRONTEND_URL}/inspection-payment?orderId=${ticket.orderId}`;
    if (customerEmail) {
      await sendRejectionEmail(customerEmail, orderRef, rejectionReason, reUploadLink);
    }

    res.json({ message: "Payment rejected", ticket });
  } catch (error) {
    res.status(500).json({ message: "Failed to reject", error: error.message });
  }
};

// ── GET verified payments ──────────────────────────────────────────────────────
exports.getVerifiedPayments = async (req, res) => {
  try {
    const InspectionTicket = getTicketModel();
    const User = getUserModel();
    const Order = getOrderModel();

    const tickets = await InspectionTicket.find({
      status: { $nin: ["PENDING_PAYMENT", "PAYMENT_UNDER_REVIEW", "PAYMENT_REJECTED"] },
      approvedAt: { $exists: true, $ne: null },
    }).sort({ approvedAt: -1, createdAt: -1 });

    const enriched = await Promise.all(tickets.map(async (t) => {
      const obj = t.toObject();
      obj.ticketId = getTicketDisplayRef(t);
      obj.orderRef = await resolveOrderRefForTicket(t, Order);
      if (t.customerId) {
        const user = await User.findById(t.customerId);
        if (user) obj.customerName = `${user.fullName || ""} ${user.lastName || ""}`.trim();
      }
      obj.amount = t.inspectionFee;
      return obj;
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── GET rejected payments ─────────────────────────────────────────────────────
exports.getRejectedPayments = async (req, res) => {
  try {
    const InspectionTicket = getTicketModel();
    const User = getUserModel();
    const Order = getOrderModel();

    const tickets = await InspectionTicket.find({
      status: "PAYMENT_REJECTED"
    }).sort({ createdAt: -1 });

    const enriched = await Promise.all(tickets.map(async (t) => {
      const obj = t.toObject();
      obj.ticketId = getTicketDisplayRef(t);
      obj.orderRef = await resolveOrderRefForTicket(t, Order);
      if (t.customerId) {
        const user = await User.findById(t.customerId);
        if (user) obj.customerName = `${user.fullName || ""} ${user.lastName || ""}`.trim();
      }
      obj.amount = t.inspectionFee;
      return obj;
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── GET available dates ───────────────────────────────────────────────────────
exports.getAvailableDates = async (req, res) => {
  try {
    const InspectionTicket = getTicketModel();
    const { ticketId } = req.params;

    let alreadyScheduled = null;
    if (ticketId) {
      const ticket = await InspectionTicket.findById(ticketId);
      if (ticket?.scheduledDate) {
        alreadyScheduled = ticket.scheduledDate;
      }
    }

    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 30);
    const years = Array.from(new Set([today.getFullYear(), endDate.getFullYear()]));
    const holidayDates = new Set();

    for (const year of years) {
      const dates = await loadPublicHolidays(year);
      dates.forEach((date) => holidayDates.add(date));
    }

    const calendar = [];

    for (let i = 1; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      const isHoliday = holidayDates.has(dateStr);

      let status = "available";
      let slotsLeft = SLOTS_PER_DAY;
      let isFullyBooked = false;

      if (isHoliday) {
        status = "holiday";
        slotsLeft = 0;
      } else {
        const bookings = await InspectionTicket.countDocuments({
          scheduledDate: {
            $gte: new Date(dateStr + "T00:00:00.000Z"),
            $lte: new Date(dateStr + "T23:59:59.999Z"),
          },
          status: { $in: ["INSPECTION_SCHEDULED", "PAYMENT_CONFIRMED"] },
        });
        slotsLeft = Math.max(0, SLOTS_PER_DAY - bookings);
        if (bookings >= SLOTS_PER_DAY) {
          status = "fully_booked";
          isFullyBooked = true;
        }
      }

      calendar.push({
        date: dateStr,
        status,
        slotsLeft,
        isWeekend: false,
        isHoliday,
        isFullyBooked,
      });
    }

    res.json({ calendar, alreadyScheduled });
  } catch (error) {
    console.error("getAvailableDates error:", error);
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── CONFIRM scheduling ────────────────────────────────────────────────────────
exports.confirmScheduling = async (req, res) => {
  try {
    const { selectedDate } = req.body;
    if (!selectedDate) return res.status(400).json({ message: "Date required" });

    const InspectionTicket = getTicketModel();
    const User = getUserModel();
    const Order = getOrderModel();

    const ticket = await InspectionTicket.findById(req.params.ticketId);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    if (!["PAYMENT_CONFIRMED"].includes(ticket.status))
      return res.status(400).json({ message: "Ticket not in schedulable state" });

    const bookings = await InspectionTicket.countDocuments({
      scheduledDate: {
        $gte: new Date(selectedDate + "T00:00:00.000Z"),
        $lte: new Date(selectedDate + "T23:59:59.999Z"),
      },
      status: { $in: ["INSPECTION_SCHEDULED", "PAYMENT_CONFIRMED"] },
      _id: { $ne: ticket._id },
    });
    if (bookings >= SLOTS_PER_DAY)
      return res.status(400).json({ message: "This date is fully booked" });

    ticket.scheduledDate = new Date(selectedDate);
    ticket.scheduledAt   = new Date();
    ticket.status        = "INSPECTION_SCHEDULED";
    await ticket.save();

    const user = ticket.customerId ? await User.findById(ticket.customerId) : null;
    const customerName  = user ? `${user.fullName || ""} ${user.lastName || ""}`.trim() : "Customer";
    const customerEmail = user?.email || "";
    const order = ticket.orderId ? await Order.findById(ticket.orderId) : null;
    const orderRef = order?.orderRef || order?.orderReference || ticket.orderId?.toString() || "N/A";

    const rescheduleLink = `${FRONTEND_URL}/inspection-scheduling?ticketId=${ticket._id}&mode=reschedule`;
    if (customerEmail) {
      await sendSchedulingEmail(customerEmail, customerName, orderRef, selectedDate, ticket._id, rescheduleLink);
    }

    res.json({ message: "Inspection scheduled", ticket });
  } catch (error) {
    res.status(500).json({ message: "Failed to schedule", error: error.message });
  }
};

// ── RESCHEDULE ────────────────────────────────────────────────────────────────
exports.rescheduleInspection = async (req, res) => {
  try {
    const { newDate } = req.body;
    if (!newDate) return res.status(400).json({ message: "Date required" });

    const InspectionTicket = getTicketModel();
    const User = getUserModel();
    const Order = getOrderModel();

    const ticket = await InspectionTicket.findById(req.params.ticketId);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    if (ticket.scheduledDate) {
      const hoursUntil = (new Date(ticket.scheduledDate) - new Date()) / (1000 * 60 * 60);
      if (hoursUntil < 24)
        return res.status(400).json({ message: "Cannot reschedule within 24 hours", hoursUntil: Math.round(hoursUntil) });
    }

    const bookings = await InspectionTicket.countDocuments({
      scheduledDate: {
        $gte: new Date(newDate + "T00:00:00.000Z"),
        $lte: new Date(newDate + "T23:59:59.999Z"),
      },
      status: { $in: ["INSPECTION_SCHEDULED", "PAYMENT_CONFIRMED"] },
      _id: { $ne: ticket._id },
    });
    if (bookings >= SLOTS_PER_DAY)
      return res.status(400).json({ message: "New date is fully booked" });

    ticket.rescheduledFrom = ticket.scheduledDate;
    ticket.rescheduledAt   = new Date();
    ticket.scheduledDate   = new Date(newDate);
    ticket.status          = "INSPECTION_SCHEDULED";
    await ticket.save();

    const user = ticket.customerId ? await User.findById(ticket.customerId) : null;
    const customerName  = user ? `${user.fullName || ""} ${user.lastName || ""}`.trim() : "Customer";
    const customerEmail = user?.email || "";
    const order = ticket.orderId ? await Order.findById(ticket.orderId) : null;
    const orderRef = order?.orderRef || order?.orderReference || ticket.orderId?.toString() || "N/A";

    const rescheduleLink = `${FRONTEND_URL}/inspection-scheduling?ticketId=${ticket._id}&mode=reschedule`;
    if (customerEmail) {
      await sendSchedulingEmail(customerEmail, customerName, orderRef, newDate, ticket._id, rescheduleLink);
    }

    res.json({ message: "Rescheduled successfully", ticket });
  } catch (error) {
    res.status(500).json({ message: "Failed to reschedule", error: error.message });
  }
};

// ── CRON: 8AM daily reminder ──────────────────────────────────────────────────
cron.schedule("0 8 * * *", async () => {
  try {
    const InspectionTicket = getTicketModel();
    const User = getUserModel();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const tickets = await InspectionTicket.find({
      status: "INSPECTION_SCHEDULED",
      reminderSent: { $ne: true },
      scheduledDate: {
        $gte: new Date(tomorrowStr + "T00:00:00.000Z"),
        $lte: new Date(tomorrowStr + "T23:59:59.999Z"),
      },
    });

    for (const ticket of tickets) {
      const user = ticket.customerId ? await User.findById(ticket.customerId) : null;
      if (user?.email) {
        const order = ticket.orderId ? await getOrderModel().findById(ticket.orderId) : null;
        const orderRef = order?.orderRef || order?.orderReference || ticket.orderId?.toString() || "N/A";
        await sendReminderEmail(user.email, `${user.fullName || ""} ${user.lastName || ""}`.trim(), orderRef, tomorrowStr);
        ticket.reminderSent = true;
        await ticket.save();
      }
    }
  } catch (e) {
    console.error("Inspection reminder cron error:", e.message);
  }
});