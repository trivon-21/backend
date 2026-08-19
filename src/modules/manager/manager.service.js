/**
 * Manager Service
 * Handles operations that require manager/admin approval
 */

const { executePaymentAutoCancelJob } = require("../../jobs/paymentAutoCancelJob");
const Order = require("../../models/Order");
const configCache = require("../../utils/config-cache");

// Add service methods here
exports.placeholder = () => {
  return "Placeholder for Manager service";
};

/**
 * Trigger payment auto-cancel job manually
 * @returns {Promise<Object>}
 */
exports.triggerPaymentAutoCancelJob = async () => {
  return await executePaymentAutoCancelJob();
};

/**
 * Approve quotation (set order status from "Awaiting Approval" to "Order Placed")
 * @param {string} orderId - Order ID
 * @param {string} managerId - Manager ID who approves
 * @returns {Promise<Order>}
 */
exports.approveQuotation = async (orderId, managerId) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.orderStatus !== "Awaiting Approval") {
      throw new Error(`Order cannot be approved from status: ${order.orderStatus}`);
    }

    const updated = await Order.findByIdAndUpdate(
      orderId,
      {
        orderStatus: "Order Placed",
        status: "Completed",
        approvedBy: managerId,
        approvedAt: new Date(),
      },
      { new: true }
    );

    return updated;
  } catch (err) {
    throw new Error(`Failed to approve quotation: ${err.message}`);
  }
};

/**
 * Reject quotation (set order status to "Cancelled")
 * @param {string} orderId - Order ID
 * @param {string} managerId - Manager ID who rejects
 * @param {string} reason - Rejection reason
 * @returns {Promise<Order>}
 */
exports.rejectQuotation = async (orderId, managerId, reason) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.orderStatus !== "Awaiting Approval") {
      throw new Error(`Order cannot be rejected from status: ${order.orderStatus}`);
    }

    const updated = await Order.findByIdAndUpdate(
      orderId,
      {
        orderStatus: "Cancelled",
        status: "Cancelled",
        rejectedBy: managerId,
        rejectionReason: reason,
        rejectedAt: new Date(),
      },
      { new: true }
    );

    return updated;
  } catch (err) {
    throw new Error(`Failed to reject quotation: ${err.message}`);
  }
};
