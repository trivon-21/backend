/**
 * Customer Dashboard Service
 */
const ServiceRequest = require("../../../models/ServiceRequest");
const Maintenance = require("../../shared/maintenance/maintenance.model");
const Inquiry = require("../../../models/Inquiry");
const orderService = require("../../shared/order/order.service");

exports.getDashboard = async (userId) => {
  try {
    const [{ orders }, repairRequests, maintenanceRequests, inquiries] = await Promise.all([
      orderService.getUserOrders(userId, {}, { limit: 10000 }),
      ServiceRequest.find({ customerId: userId, serviceType: "Repair" }),
      Maintenance.find({ customerId: userId }),
      Inquiry.find({ customer: userId })
    ]);
    const serviceRequests = [...repairRequests, ...maintenanceRequests];

    const totalPurchases = orders.length;
    const returnOrders = orders.filter(o => o.status === "Returned").length;
    const pendingPayment = orders.filter(o => o.status === "Pending").length;
    const rejectedPayment = orders.filter(o => o.status === "Rejected").length;
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
      stats: { totalPurchases, returnOrders, pendingPayment, rejectedPayment, completed },
      orders: orders.map(o => ({
        id: o.id,
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
