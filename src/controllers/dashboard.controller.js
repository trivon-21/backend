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

    const srOngoing   = serviceRequests.filter(s => s.status === "Ongoing").length;
    const srAddressed = serviceRequests.filter(s => s.status === "Addressed").length;
    const srClosed    = serviceRequests.filter(s => s.status === "Closed").length;

    const iqOngoing   = inquiries.filter(i => i.status === "Ongoing").length;
    const iqAddressed = inquiries.filter(i => i.status === "Addressed").length;

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
