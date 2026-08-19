const Order = require("../models/Order");
const ServiceRequest = require("../models/ServiceRequest");
const Inquiry = require("../models/Inquiry");

// GET /api/dashboard
exports.getDashboard = async (req, res) => {
  try {
    const customerId = req.user._id;

    const [orders, serviceRequests, inquiries] = await Promise.all([
      Order.find({ customer: customerId }).sort({ createdAt: -1 }),
      ServiceRequest.find({ customer: customerId }),
      Inquiry.find({ customer: customerId })
    ]);

    const totalPurchases = orders.length;
    const returnOrders   = orders.filter(o => o.status === "Returned").length;
    const pendingPayment = orders.filter(o => o.status === "Pending").length;
    const completed      = orders.filter(o => o.status === "Completed").length;

    // Map new statuses: Pending/Assigned/In Progress → Ongoing, Completed → Addressed, Cancelled → Closed
    const srOngoing   = serviceRequests.filter(s =>
      ["Pending", "Assigned", "In Progress", "Ongoing"].includes(s.status)
    ).length;
    const srAddressed = serviceRequests.filter(s =>
      ["Completed", "Addressed"].includes(s.status)
    ).length;
    const srClosed    = serviceRequests.filter(s =>
      ["Cancelled", "Closed"].includes(s.status)
    ).length;

    const iqOngoing   = inquiries.filter(i => i.status === "Ongoing").length;
    const iqAddressed = inquiries.filter(i => ["Addressed", "Closed"].includes(i.status)).length;

    return res.json({
      stats: { totalPurchases, returnOrders, pendingPayment, completed },
      orders: orders.map(o => ({
        id: o._id,
        itemName: o.itemName,
        date: o.createdAt,
        amount: o.amount,
        status: o.status
      })),
      serviceRequests: { ongoing: srOngoing, addressed: srAddressed, closed: srClosed },
      inquiries: { ongoing: iqOngoing, addressed: iqAddressed }
    });
  } catch (err) {
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};
