const mongoose = require("mongoose");

const getInvoiceModel = () => mongoose.model("Invoice");
const getOrderModel = () => { try { return mongoose.model("Order"); } catch { return null; } };
const getTicketModel = () => { try { return mongoose.model("InspectionTicket"); } catch { return null; } };
const getServiceTicket = () => { try { return mongoose.model("ServiceTicket"); } catch { return null; } };
const getPurchaseRequestModel = () => { try { return mongoose.model("L_PurchaseRequest"); } catch { return null; } };

const getLCharge = async (name) => {
  try {
    const LCharge = mongoose.model("L_Charge");
    const charge = await LCharge.findOne({ name });
    return charge ? charge.amount : null;
  } catch { return null; }
};

// ── Helper: parse date range from query ───────────────────────────────────────
function getDateRange(query) {
  const now = new Date();
  let start = query.startDate
    ? new Date(query.startDate)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  let end = query.endDate
    ? new Date(new Date(query.endDate).setHours(23, 59, 59, 999))
    : new Date();
  return { start, end };
}

// ── GET revenue summary ───────────────────────────────────────────────────────
exports.getRevenueSummary = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query);
    const Invoice = getInvoiceModel();

    // 1. Paid invoices — paidAt with updatedAt fallback
    const paidInvoices = await Invoice.find({
      status: "PAID",
      $or: [
        { paidAt: { $gte: start, $lte: end } },
        { paidAt: { $exists: false }, updatedAt: { $gte: start, $lte: end } },
        { paidAt: null, updatedAt: { $gte: start, $lte: end } },
      ]
    });
    const salesRevenue = paidInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0);

    // 2. Accepted invoices (pending payment) — acceptedAt with updatedAt fallback
    const acceptedInvoices = await Invoice.find({
      status: "ACCEPTED",
      $or: [
        { acceptedAt: { $gte: start, $lte: end } },
        { acceptedAt: { $exists: false }, updatedAt: { $gte: start, $lte: end } },
        { acceptedAt: null, updatedAt: { $gte: start, $lte: end } },
      ]
    });
    const pendingRevenue = acceptedInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0);

    // 3. Inspection fees — match by exclusion (same logic as verified payments list)
    //    so newly-scheduled/inspected tickets still count as revenue
    let inspectionRevenue = 0;
    const Ticket = getTicketModel();
    if (Ticket) {
      const approvedTickets = await Ticket.find({
        status: { $nin: ["PENDING_PAYMENT", "PAYMENT_UNDER_REVIEW", "PAYMENT_REJECTED"] },
        approvedAt: { $exists: true, $ne: null },
        $or: [
          { approvedAt: { $gte: start, $lte: end } },
          { updatedAt: { $gte: start, $lte: end } },
        ]
      });
      const inspFee = await getLCharge("inspection") || 2500;
      inspectionRevenue = approvedTickets.reduce((s, t) => s + (t.inspectionFee || inspFee), 0);
    }


  // Maintenance revenue — from the Maintenance collection, not ServiceTicket
let serviceRevenue = 0;
try {
  const Maintenance = mongoose.model("Maintenance");
  const approvedMaintenance = await Maintenance.find({
    status: "Finance Approved",
    updatedAt: { $gte: start, $lte: end }
  });
  serviceRevenue = approvedMaintenance.reduce((s, m) => s + (m.paymentAmount || 0), 0);
} catch (e) {
  console.error("Maintenance revenue calc failed:", e.message);
}

    // 5. Buy-only payments — match by status OR paymentStatus (team schema has both fields;
    //    which one actually gets set depends on the exact approval codepath, so check both)
    let buyOnlyRevenue = 0;
    const Order = getOrderModel();
    if (Order) {
      const approvedOrders = await Order.find({
        $and: [
          {
            $or: [
              { status: "Payment Confirmed" },
              { status: "Confirmed" },
              { paymentStatus: "Confirmed" },
              { paymentStatus: "Approved" },
            ]
          },
          {
            $or: [
              { approvedAt: { $gte: start, $lte: end } },
              { approvedAt: { $exists: false }, updatedAt: { $gte: start, $lte: end } },
              { approvedAt: null, updatedAt: { $gte: start, $lte: end } },
            ]
          }
        ]
      });
      buyOnlyRevenue = approvedOrders.reduce((s, o) => {
        const amount = o.amount || o.items?.[0]?.price || o.total || o.subtotal || 0;
        return s + amount;
      }, 0);
    }

    // 6. Purchase expenses (money going OUT)
    let purchaseExpenses = 0;
    const PurchaseRequest = getPurchaseRequestModel();
    if (PurchaseRequest) {
      const approvedPurchases = await PurchaseRequest.find({
        status: { $in: ["APPROVED", "approved"] },
        $or: [
          { approvedAt: { $gte: start, $lte: end } },
          { approvedAt: { $exists: false }, updatedAt: { $gte: start, $lte: end } },
          { approvedAt: null, updatedAt: { $gte: start, $lte: end } },
        ]
      });
      purchaseExpenses = approvedPurchases.reduce((s, p) => s + (p.totalAmount || p.totalEstimate || 0), 0);
    }

    const monthlyData = await getMonthlyBreakdown(Invoice, 6);
    const totalCollected = (salesRevenue || 0) + (inspectionRevenue || 0) + (serviceRevenue || 0) + (buyOnlyRevenue || 0);

    res.json({
      salesRevenue,
      inspectionRevenue,
      serviceRevenue,
      buyOnlyRevenue,
      pendingRevenue,
      purchaseExpenses,
      totalCollected,
      netRevenue: totalCollected - (purchaseExpenses || 0),
      totalCombined: totalCollected + (pendingRevenue || 0),
      monthlyData,
    });
  } catch (error) {
    console.error("getRevenueSummary error:", error);
    res.status(500).json({ message: "Failed to fetch revenue summary", error: error.message });
  }
};

// ── Helper: monthly breakdown — 'total' field represents pure revenue          ─
//    (buyOnly + inspection + service + invoice), matching the bar chart's need ─
async function getMonthlyBreakdown(Invoice, months) {
  const result = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

    // 1. Invoice revenue
    const invoices = await Invoice.find({
      status: { $in: ["PAID", "ACCEPTED", "SENT", "DRAFT"] },
      createdAt: { $gte: start, $lte: end },
    });
    const invoiceTotal = invoices.reduce((s, inv) => s + (inv.grandTotal || 0), 0);

    // 2. Buy Only — match by status OR paymentStatus
    let buyOnly = 0;
    try {
      const Order = mongoose.model("Order");
      const orders = await Order.find({
        $and: [
          {
            $or: [
              { status: "Payment Confirmed" },
              { status: "Confirmed" },
              { paymentStatus: "Confirmed" },
              { paymentStatus: "Approved" },
            ]
          },
          {
            $or: [
              { approvedAt: { $gte: start, $lte: end } },
              { approvedAt: { $exists: false }, updatedAt: { $gte: start, $lte: end } },
              { approvedAt: null, updatedAt: { $gte: start, $lte: end } },
            ]
          }
        ]
      });
      buyOnly = orders.reduce((s, o) => {
        const amount = o.amount || o.items?.[0]?.price || o.total || o.subtotal || 0;
        return s + amount;
      }, 0);
    } catch {}

    // 3. Inspection fees — match by exclusion
    let inspection = 0;
    try {
      const Ticket = mongoose.model("InspectionTicket");
      const tickets = await Ticket.find({
        status: { $nin: ["PENDING_PAYMENT", "PAYMENT_UNDER_REVIEW", "PAYMENT_REJECTED"] },
        approvedAt: { $exists: true, $ne: null },
        $or: [
          { approvedAt: { $gte: start, $lte: end } },
          { updatedAt: { $gte: start, $lte: end } },
        ]
      });
      const inspFee = await getLCharge("inspection") || 2500;
      inspection = tickets.reduce((s, t) => s + (t.inspectionFee || inspFee), 0);
    } catch {}

  // 4. Maintenance revenue
let service = 0;
try {
  const Maintenance = mongoose.model("Maintenance");
  const maints = await Maintenance.find({
    status: "Finance Approved",
    updatedAt: { $gte: start, $lte: end }
  });
  service = maints.reduce((s, m) => s + (m.paymentAmount || 0), 0);
} catch {}

    // 5. Purchase expenses
    let purchase = 0;
    try {
      const PurchaseRequest = mongoose.model("L_PurchaseRequest");
      const purchases = await PurchaseRequest.find({
        status: { $in: ["APPROVED", "approved"] },
        $or: [
          { approvedAt: { $gte: start, $lte: end } },
          { approvedAt: { $exists: false }, updatedAt: { $gte: start, $lte: end } },
          { approvedAt: null, updatedAt: { $gte: start, $lte: end } },
        ]
      });
      purchase = purchases.reduce((s, p) => s + (p.totalAmount || p.totalEstimate || 0), 0);
    } catch {}

    result.push({
      month:      d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
      total:      invoiceTotal + buyOnly + inspection + service, // pure revenue for the bar chart
      invoice:    invoiceTotal,
      buyOnly,
      inspection,
      service,
      purchase,
      net:        invoiceTotal + buyOnly + inspection + service - purchase,
    });
  }
  return result;
}

// ── GET invoices/transactions ─────────────────────────────────────────────────
exports.getTransactions = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query);
    const { status, page = 1, limit = 15 } = req.query;
    const Invoice = getInvoiceModel();

    const query = {
      $or: [
        { createdAt:  { $gte: start, $lte: end } },
        { paidAt:     { $gte: start, $lte: end } },
        { acceptedAt: { $gte: start, $lte: end } },
        { updatedAt:  { $gte: start, $lte: end } },
      ]
    };
    if (status && status !== "ALL") query.status = status;

    const total = await Invoice.countDocuments(query);
    const invoices = await Invoice.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const formatted = invoices.map(inv => ({
      _id:           inv._id,
      invoiceNumber: inv.invoiceNumber,
      customerName:  inv.customerName || "—",
      customerEmail: inv.customerEmail,
      orderId:       inv.orderId,
      type:          inv.invoiceType === "REPAIR" ? "Repair Invoice" : "Installation Sale",
      grandTotal:    inv.grandTotal || 0,
      status:        inv.status,
      createdAt:     inv.createdAt,
      acceptedAt:    inv.acceptedAt,
      paidAt:        inv.paidAt,
    }));

    res.json({ transactions: formatted, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error("getTransactions error:", error);
    res.status(500).json({ message: "Failed", error: error.message });
  }
};

// ── GET outstanding payments ──────────────────────────────────────────────────
exports.getOutstanding = async (req, res) => {
  try {
    const Invoice = getInvoiceModel();
    const now = new Date();

    const outstanding = await Invoice.find({ status: "ACCEPTED" }).sort({ paymentDeadline: 1 });

    const formatted = outstanding.map(inv => {
      const due = inv.paymentDeadline ? new Date(inv.paymentDeadline) : null;
      const daysLeft = due ? Math.ceil((due - now) / (1000 * 60 * 60 * 24)) : null;
      return {
        _id:             inv._id,
        invoiceNumber:   inv.invoiceNumber,
        customerName:    inv.customerName,
        customerEmail:   inv.customerEmail,
        grandTotal:      inv.grandTotal,
        acceptedAt:      inv.acceptedAt,
        paymentDeadline: due,
        daysLeft,
        overdue:         daysLeft !== null && daysLeft < 0,
        daysOverdue:     daysLeft !== null && daysLeft < 0 ? Math.abs(daysLeft) : 0,
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error("getOutstanding error:", error);
    res.status(500).json({ message: "Failed to fetch outstanding payments", error: error.message });
  }
};

// ── GET payment collections ───────────────────────────────────────────────────
exports.getPaymentCollections = async (req, res) => {
  try {
    const { start, end } = getDateRange(req.query);
    const collections = [];
    const Invoice = getInvoiceModel();

    // 1. Invoice payments (PAID)
    const paidInv = await Invoice.find({
      status: "PAID",
      $or: [
        { paidAt: { $gte: start, $lte: end } },
        { paidAt: { $exists: false }, updatedAt: { $gte: start, $lte: end } },
        { paidAt: null, updatedAt: { $gte: start, $lte: end } },
      ],
    });
    paidInv.forEach(inv => collections.push({
      date:      inv.paidAt || inv.updatedAt,
      type:      inv.invoiceType === "REPAIR" ? "Repair Invoice Payment" : "Invoice Payment",
      reference: inv.invoiceNumber,
      customer:  inv.customerName || "—",
      amount:    inv.grandTotal || 0,
      method:    "Bank Transfer",
      status:    "Paid",
    }));

    // 2. Buy Only approved orders — match by status OR paymentStatus
    const Order = getOrderModel();
    if (Order) {
      const orders = await Order.find({
        $and: [
          {
            $or: [
              { status: "Payment Confirmed" },
              { status: "Confirmed" },
              { paymentStatus: "Confirmed" },
              { paymentStatus: "Approved" },
            ]
          },
          {
            $or: [
              { approvedAt: { $gte: start, $lte: end } },
              { approvedAt: { $exists: false }, updatedAt: { $gte: start, $lte: end } },
              { approvedAt: null, updatedAt: { $gte: start, $lte: end } },
            ]
          }
        ]
      });
      for (const o of orders) {
        let customerName = "—";
        try {
          const User = mongoose.model("User");
          const user = await User.findById(o.customer || o.userId);
          if (user) customerName = `${user.fullName || ""} ${user.lastName || ""}`.trim();
          else if (o.customerName) customerName = o.customerName;
          else if (o.shippingDetails) customerName = `${o.shippingDetails.firstName || ""} ${o.shippingDetails.lastName || ""}`.trim();
        } catch {}
        const amount = o.amount || o.items?.[0]?.price || o.total || o.subtotal || 0;
        collections.push({
          date:      o.approvedAt || o.updatedAt,
          type:      "Buy Only Payment",
          reference: o.orderRef || o.orderReference || o._id.toString().slice(-6).toUpperCase(),
          customer:  customerName,
          amount,
          method:    "Bank Transfer",
          status:    "Approved",
        });
      }
    }

    // 3. Inspection payments — match by exclusion
    const Ticket = getTicketModel();
    if (Ticket) {
      const tickets = await Ticket.find({
        status: { $nin: ["PENDING_PAYMENT", "PAYMENT_UNDER_REVIEW", "PAYMENT_REJECTED"] },
        approvedAt: { $exists: true, $ne: null },
        $or: [
          { approvedAt: { $gte: start, $lte: end } },
          { updatedAt: { $gte: start, $lte: end } },
        ],
      });
      for (const t of tickets) {
        let customerName = "—";
        try {
          const User = mongoose.model("User");
          const user = await User.findById(t.customerId);
          if (user) customerName = `${user.fullName || ""} ${user.lastName || ""}`.trim();
        } catch {}
        const inspFee = await getLCharge("inspection") || 2500;
        collections.push({
          date:      t.approvedAt || t.updatedAt,
          type:      "Inspection Fee",
          reference: `I-Tic-${t._id.toString().slice(-5).toUpperCase()}`,
          customer:  customerName,
          amount:    t.inspectionFee || inspFee,
          method:    "Bank Transfer",
          status:    "Approved",
        });
      }
    }

    const getMaintenanceModel = () => {
  try { return mongoose.model("Maintenance"); }
  catch {
    const s = new mongoose.Schema({
      customerId: mongoose.Schema.Types.ObjectId,
      status: String,
      paymentAmount: Number,
    }, { strict: false, timestamps: true });
    return mongoose.model("Maintenance", s, "maintenances");
  }
};

// 4. Maintenance payments
const Maintenance = getMaintenanceModel();
const maints = await Maintenance.find({
  status: "Finance Approved",
  updatedAt: { $gte: start, $lte: end },
});
for (const m of maints) {
  let customerName = "—";
  try {
    const User = mongoose.model("User");
    const user = await User.findById(m.customerId);
    if (user) customerName = `${user.fullName || ""} ${user.lastName || ""}`.trim();
  } catch {}
  collections.push({
    date:      m.updatedAt,
    type:      "Maintenance Fee",
    reference: m.ticketId || `MNT-${m._id.toString().slice(-6).toUpperCase()}`,
    customer:  customerName,
    amount:    m.paymentAmount || 0,
    method:    "Bank Transfer",
    status:    "Approved",
  });
}

    // 5. Purchase Request expenses (money going OUT — negative)
    const PurchaseRequest = getPurchaseRequestModel();
    if (PurchaseRequest) {
      const approvedPurchases = await PurchaseRequest.find({
        status: { $in: ["APPROVED", "approved"] },
        $or: [
          { approvedAt: { $gte: start, $lte: end } },
          { approvedAt: { $exists: false }, updatedAt: { $gte: start, $lte: end } },
          { approvedAt: null, updatedAt: { $gte: start, $lte: end } },
        ],
      });
      approvedPurchases.forEach(p => collections.push({
        date:      p.approvedAt || p.updatedAt,
        type:      "Purchase Expense",
        reference: `PR-${p._id.toString().slice(-6).toUpperCase()}`,
        customer:  p.requestedBy || "—",
        amount:    -(p.totalAmount || p.totalEstimate || 0),
        method:    "Bank Transfer",
        status:    "Approved",
      }));
    }

    // FIX: newest first (was oldest first)
    collections.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(collections);
  } catch (error) {
    console.error("getPaymentCollections error:", error);
    res.status(500).json({ message: "Failed", error: error.message });
  }
};