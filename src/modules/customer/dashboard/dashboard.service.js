/**
 * Customer Dashboard Service
 */
const Order = require("../../../models/Order");
const ServiceRequest = require("../../../models/ServiceRequest");
const Inquiry = require("../../../models/Inquiry");

exports.getDashboard = async (userId) => {
  try {
    const [orders, serviceRequests, inquiries] = await Promise.all([
      Order.find({ customerId: userId }).sort({ createdAt: -1 }),
      ServiceRequest.find({ customerId: userId }),
      Inquiry.find({ customerId: userId })
    ]);

    const totalPurchases = orders.length;
    const returnOrders = orders.filter(o => o.status === "Returned").length;
    const pendingPayment = orders.filter(o => o.status === "Pending").length;
    const completed = orders.filter(o => o.status === "Completed").length;

    const srOngoing = serviceRequests.filter(s =>
      ["Pending", "Assigned", "In Progress", "Ongoing"].includes(s.status)
    ).length;
    const srAddressed = serviceRequests.filter(s =>
      ["Completed", "Addressed"].includes(s.status)
    ).length;
    const srClosed = serviceRequests.filter(s =>
      ["Cancelled", "Closed"].includes(s.status)
    ).length;

    const iqOngoing = inquiries.filter(i => i.status === "Ongoing").length;
    const iqAddressed = inquiries.filter(i => ["Addressed", "Closed"].includes(i.status)).length;

    return {
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
    };
  } catch (err) {
    throw new Error(`Failed to fetch dashboard: ${err.message}`);
  }
};
