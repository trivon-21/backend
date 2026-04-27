const mongoose = require("mongoose");

const getInvoiceModel = () => mongoose.model("Invoice");
const getOrderModel = () => { try { return mongoose.model("Order"); } catch { return null; } };
const getTicketModel = () => { try { return mongoose.model("InspectionTicket"); } catch { return null; } };
const getServiceTicket = () => { try { return mongoose.model("ServiceTicket"); } catch { return null; } };

// ── Helper: parse date range from query ───────────────────────────────────────
function getDateRange(query) {
  const now = new Date();
  let start = query.startDate ? new Date(query.startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
  let end = query.endDate ? new Date(new Date(query.endDate).setHours(23, 59, 59, 999)) : new Date();
  return { start, end };
}

// ── GET revenue summary ───────────────────────────────────────────────────────
exports.getRevenueSummary = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query);
    const Invoice = getInvoiceModel();

    // Sales revenue = paid invoices grandTotal
    const paidInvoices = await Invoice.find({
      status: "PAID",
      paidAt: { $gte: start, $lte: end },
    });
    const salesRevenue = paidInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0);

    // Accepted invoices (pending payment)
    const acceptedInvoices = await Invoice.find({
      status: "ACCEPTED",
      acceptedAt: { $gte: start, $lte: end },
    });
    const pendingRevenue = acceptedInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0);

    // Inspection fees collected (approved inspection tickets)
    let inspectionRevenue = 0;
    const Ticket = getTicketModel();
    if (Ticket) {
      const approvedTickets = await Ticket.find({
        status: { $in: ["PAYMENT_CONFIRMED", "APPROVED", "SCHEDULED", "ONGOING", "INSPECTED", "SUBMITTED"] },
        approvedAt: { $gte: start, $lte: end },
      });
      inspectionRevenue = approvedTickets.reduce((s, t) => s + (t.inspectionFee || t.amount || 0), 0);
    }

    // Service payments collected
    let serviceRevenue = 0;
    const SvcTicket = getServiceTicket();
    if (SvcTicket) {
      const approvedSvc = await SvcTicket.find({
        paymentStatus: { $in: ["APPROVED", "VERIFIED"] },
        updatedAt: { $gte: start, $lte: end },
      });
      serviceRevenue = approvedSvc.reduce((s, t) => s + (t.serviceFee || t.amount || 0), 0);
    }

    // Buy-only payments
    let buyOnlyRevenue = 0;
    const Order = getOrderModel();
    if (Order) {
      const approvedOrders = await Order.find({
        paymentStatus: "Approved",
        updatedAt: { $gte: start, $lte: end },
      });
      buyOnlyRevenue = approvedOrders.reduce((s, o) => s + (o.amount || 0), 0);
    }

    // Monthly breakdown for chart (last 6 months)
    const monthlyData = await getMonthlyBreakdown(Invoice, 6);

    res.json({
      salesRevenue,
      inspectionRevenue,
      serviceRevenue,
      buyOnlyRevenue,
      pendingRevenue,
      totalCollected: salesRevenue + inspectionRevenue + serviceRevenue + buyOnlyRevenue,
      totalCombined: salesRevenue + inspectionRevenue + serviceRevenue + buyOnlyRevenue + pendingRevenue,
      monthlyData,
    });
  } catch (error) {
    console.error("getRevenueSummary error:", error);
    res.status(500).json({ message: "Failed to fetch revenue summary", error: error.message });
  }
};

// ── Helper: monthly breakdown ─────────────────────────────────────────────────
async function getMonthlyBreakdown(Invoice, months) {
  const result = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const paid = await Invoice.find({ status: "PAID", paidAt: { $gte: start, $lte: end } });
    const total = paid.reduce((s, inv) => s + (inv.grandTotal || 0), 0);
    result.push({
      month: d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      total,
    });
  }
  return result;
}

// ── GET invoices/transactions ─────────────────────────────────────────────────
exports.getTransactions = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query);
    const { status, page = 1, limit = 20 } = req.query;
    const Invoice = getInvoiceModel();

    const query = { createdAt: { $gte: start, $lte: end } };
    if (status && status !== "ALL") query.status = status;

    const total = await Invoice.countDocuments(query);
    const invoices = await Invoice.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const formatted = invoices.map(inv => ({
      _id: inv._id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customerName,
      customerEmail: inv.customerEmail,
      orderId: inv.orderId,
      type: "Installation Sale",
      grandTotal: inv.grandTotal,
      status: inv.status,
      createdAt: inv.createdAt,
      acceptedAt: inv.acceptedAt,
      paidAt: inv.paidAt,
    }));

    res.json({ transactions: formatted, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error("getTransactions error:", error);
    res.status(500).json({ message: "Failed to fetch transactions", error: error.message });
  }
};

// ── GET outstanding payments ──────────────────────────────────────────────────
exports.getOutstanding = async (req, res) => {
  try {
    const Invoice = getInvoiceModel();
    const now = new Date();

    // ACCEPTED invoices where payment deadline hasn't passed — still waiting
    const outstanding = await Invoice.find({
      status: "ACCEPTED",
    }).sort({ paymentDeadline: 1 });

    const formatted = outstanding.map(inv => {
      const due = inv.paymentDeadline ? new Date(inv.paymentDeadline) : null;
      const daysLeft = due ? Math.ceil((due - now) / (1000 * 60 * 60 * 24)) : null;
      return {
        _id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        customerEmail: inv.customerEmail,
        grandTotal: inv.grandTotal,
        acceptedAt: inv.acceptedAt,
        paymentDeadline: due,
        daysLeft,
        overdue: daysLeft !== null && daysLeft < 0,
        daysOverdue: daysLeft !== null && daysLeft < 0 ? Math.abs(daysLeft) : 0,
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error("getOutstanding error:", error);
    res.status(500).json({ message: "Failed to fetch outstanding payments", error: error.message });
  }
};

// ── GET payment collections (approved payments across all types) ──────────────
exports.getPaymentCollections = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query);
    const collections = [];

    // Buy-only approved orders
    const Order = getOrderModel();
    if (Order) {
      const orders = await Order.find({
        paymentStatus: "Approved",
        updatedAt: { $gte: start, $lte: end },
      });
      orders.forEach(o => collections.push({
        date: o.updatedAt,
        type: "Buy Only",
        reference: o.orderRef || o._id.toString().slice(-6).toUpperCase(),
        customer: o.customerName || "—",
        amount: o.amount || 0,
        method: "Bank Transfer",
        status: "Approved",
      }));
    }

    // Inspection payments approved
    const Ticket = getTicketModel();
    if (Ticket) {
      const tickets = await Ticket.find({
        status: { $in: ["PAYMENT_CONFIRMED", "APPROVED", "SCHEDULED", "ONGOING", "INSPECTED", "SUBMITTED"] },
        approvedAt: { $gte: start, $lte: end },
      });
      tickets.forEach(t => collections.push({
        date: t.approvedAt || t.updatedAt,
        type: "Inspection Fee",
        reference: `I-Tic-${t._id.toString().slice(-5).toUpperCase()}`,
        customer: "—",
        amount: t.inspectionFee || t.amount || 5000,
        method: "Bank Transfer",
        status: "Approved",
      }));
    }

    // Service payments approved
    const SvcTicket = getServiceTicket();
    if (SvcTicket) {
      const svcs = await SvcTicket.find({
        paymentStatus: { $in: ["APPROVED", "VERIFIED"] },
        updatedAt: { $gte: start, $lte: end },
      });
      svcs.forEach(t => collections.push({
        date: t.updatedAt,
        type: t.serviceType === "REPAIR" ? "Repair Service" : "Maintenance Service",
        reference: `SVC-${t._id.toString().slice(-6).toUpperCase()}`,
        customer: "—",
        amount: t.serviceFee || t.amount || 0,
        method: "Bank Transfer",
        status: "Approved",
      }));
    }

    // Invoice payments (PAID)
    const Invoice = getInvoiceModel();
    const paidInv = await Invoice.find({
      status: "PAID",
      paidAt: { $gte: start, $lte: end },
    });
    paidInv.forEach(inv => collections.push({
      date: inv.paidAt,
      type: "Invoice Payment",
      reference: inv.invoiceNumber,
      customer: inv.customerName,
      amount: inv.grandTotal || 0,
      method: "Bank Transfer",
      status: "Paid",
    }));

    // Sort by date desc
    collections.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(collections);
  } catch (error) {
    console.error("getPaymentCollections error:", error);
    res.status(500).json({ message: "Failed to fetch collections", error: error.message });
  }
};