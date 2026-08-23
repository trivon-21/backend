/**
 * Manager Service
 * Handles operations that require manager/admin approval
 */

const { executePaymentAutoCancelJob } = require("../../jobs/paymentAutoCancelJob");
const Order = require("../../models/Order");
const configCache = require("../../utils/config-cache");
const mongoose = require('mongoose');
const Inventory = require('../../models/Inventory');
const WarehousePickRequest = require('../../models/WarehousePickRequest');
const PurchaseRequest = require('../../models/PurchaseRequest');
const ReceiptAuthorization = require('../../models/ReceiptAuthorization');
const { isLowStock } = require('../../utils/inventory-domain');
const { loadManagerTickets } = require('./manager.ticket-read-model');

// Add service methods here
exports.placeholder = () => {
  return "Placeholder for Manager service";
};

function serviceError(message) {
  const error = new Error(message);
  error.statusCode = 503;
  error.code = 'DATABASE_OFFLINE';
  return error;
}

function priorityRank(priority) {
  return { high: 3, medium: 2, low: 1 }[priority] || 0;
}

function unresolved(ticket) {
  return ticket.status !== 'resolved';
}

function ticketRoute(status) {
  return { route: '/manager/work-items', queryParams: status ? { status } : {} };
}

exports.getDashboardData = async (user) => {
  if (mongoose.connection.readyState !== 1) {
    throw serviceError('Manager dashboard is unavailable while the database is offline');
  }

  const [tickets, orders, inventory, materialRequests, authorizations] = await Promise.all([
    loadManagerTickets(),
    PurchaseRequest.find({ status: { $ne: 'draft' } }).sort({ updatedAt: -1 }).lean(),
    Inventory.find().sort({ updatedAt: -1 }).lean(),
    WarehousePickRequest.find({ status: 'pending' }).lean(),
    ReceiptAuthorization.find().sort({ updatedAt: -1 }).lean(),
  ]);

  const now = new Date();
  const nearDue = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const activeTickets = tickets.filter(unresolved);
  const unassigned = activeTickets.filter((ticket) => !ticket.assignedTechnicianId && !ticket.assignedTo);
  const overdue = activeTickets.filter((ticket) => ticket.slaDueAt && new Date(ticket.slaDueAt) <= now);
  const dueSoon = activeTickets.filter((ticket) => {
    if (!ticket.slaDueAt) return false;
    const due = new Date(ticket.slaDueAt);
    return due > now && due <= nearDue;
  });
  const pendingOrders = orders.filter((order) => ['pending-manager', 'pending-approval'].includes(order.status));
  const pendingAuthorizations = authorizations.filter((authorization) => authorization.status === 'pending');
  const awaitingReceipt = authorizations.filter((authorization) => ['approved', 'partially-received'].includes(authorization.status));
  const awaitingFinance = authorizations.filter((authorization) => authorization.receivedQuantity > 0 && authorization.financeReviewStatus === 'pending');
  const lowStock = inventory.filter(isLowStock);
  const reservedItems = inventory.reduce((sum, item) => sum + Number(item.reserved || 0), 0);

  const stats = {
    openTickets: {
      total: activeTickets.length,
      subStats: [
        { label: 'Open', value: activeTickets.filter((ticket) => ticket.status === 'open').length },
        { label: 'In Progress', value: activeTickets.filter((ticket) => ticket.status === 'in-progress').length },
      ],
    },
    unassignedTickets: {
      total: unassigned.length,
      subStats: [
        { label: 'High Priority', value: unassigned.filter((ticket) => ticket.priority === 'high').length },
        { label: 'Other', value: unassigned.filter((ticket) => ticket.priority !== 'high').length },
      ],
    },
    slaRisk: {
      total: overdue.length + dueSoon.length,
      subStats: [
        { label: 'Overdue', value: overdue.length },
        { label: 'Due in 24h', value: dueSoon.length },
      ],
    },
    pendingApprovals: {
      total: pendingOrders.length + pendingAuthorizations.length,
      subStats: [
        { label: 'Urgent', value: pendingOrders.filter((order) => order.priority === 'urgent').length },
        { label: 'Value', value: pendingOrders.reduce((sum, order) => sum + Number(order.totalEstimate || 0), 0) },
        { label: 'Non-PO', value: pendingAuthorizations.length },
      ],
    },
  };

  const ticketActivity = tickets.slice(0, 6).map((ticket) => ({
    id: String(ticket._id),
    type: ticket.status === 'escalated' ? 'escalation' : 'ticket',
    title: `${ticket.status === 'resolved' ? 'Resolved' : 'Updated'} ${ticket.ticketId}`,
    description: ticket.subject,
    timestamp: ticket.updatedAt || ticket.createdAt,
    ...ticketRoute(ticket.status),
  }));
  const orderActivity = orders.slice(0, 6).map((order) => ({
    id: String(order._id),
    type: 'order',
    title: `${order.requestId} is ${String(order.status).replace('-', ' ')}`,
    description: `${order.supplierName} · ${Number(order.totalEstimate || 0).toLocaleString()}`,
    timestamp: order.updatedAt || order.createdAt,
    route: '/manager/orders',
    queryParams: { status: order.status },
  }));
  const recentActivity = [...ticketActivity, ...orderActivity]
    .filter((item) => item.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 8);

  const pendingActions = [
    ...pendingOrders.map((order) => ({
      id: `order-${order._id}`,
      type: 'order',
      title: `Review ${order.requestId}`,
      description: `${order.supplierName} purchase request`,
      priority: order.priority === 'urgent' ? 'high' : 'medium',
      createdAt: order.createdAt,
      route: '/manager/orders',
      queryParams: { status: 'pending-manager' },
    })),
    ...pendingAuthorizations.map((authorization) => ({
      id: `authorization-${authorization._id}`,
      type: 'authorization',
      title: `Review ${authorization.authorizationNumber}`,
      description: `${String(authorization.nonPoReason || 'NON_PO').replaceAll('_', ' ')} · ${authorization.supplierName || 'Supplier not specified'}`,
      priority: authorization.nonPoReason === 'EMERGENCY_REPAIR' ? 'high' : 'medium',
      createdAt: authorization.createdAt,
      route: '/manager/orders',
      queryParams: { type: 'non-po', status: 'pending' },
    })),
    ...awaitingReceipt.map((authorization) => ({
      id: `receive-${authorization._id}`,
      type: 'authorization',
      title: `Approved receipt awaiting stock posting`,
      description: authorization.authorizationNumber,
      priority: authorization.nonPoReason === 'EMERGENCY_REPAIR' ? 'high' : 'medium',
      createdAt: authorization.approvedAt,
      route: '/manager/orders',
      queryParams: { type: 'non-po', status: authorization.status },
    })),
    ...awaitingFinance.map((authorization) => ({
      id: `finance-${authorization._id}`,
      type: 'finance',
      title: `Finance reconciliation pending`,
      description: `${authorization.authorizationNumber || 'Receipt authorization'} · ${Number(authorization.estimatedTotal || 0).toLocaleString()}`,
      priority: 'low',
      createdAt: authorization.updatedAt,
      route: '/manager/orders',
      queryParams: { type: 'non-po', finance: 'pending' },
    })),
    ...activeTickets.filter((ticket) => ticket.status === 'escalated').map((ticket) => ({
      id: `escalated-${ticket._id}`,
      type: 'escalation',
      title: `Escalated ${ticket.ticketId}`,
      description: ticket.subject,
      priority: 'high',
      createdAt: ticket.createdAt,
      ...ticketRoute('escalated'),
    })),
    ...overdue.map((ticket) => ({
      id: `overdue-${ticket._id}`,
      type: 'sla',
      title: `Overdue SLA: ${ticket.ticketId}`,
      description: ticket.subject,
      priority: 'high',
      createdAt: ticket.slaDueAt,
      ...ticketRoute(ticket.status),
    })),
    ...dueSoon.map((ticket) => ({
      id: `due-${ticket._id}`,
      type: 'sla',
      title: `SLA due soon: ${ticket.ticketId}`,
      description: ticket.subject,
      priority: 'medium',
      createdAt: ticket.slaDueAt,
      ...ticketRoute(ticket.status),
    })),
    ...unassigned.map((ticket) => ({
      id: `unassigned-${ticket._id}`,
      type: 'ticket',
      title: `Assign ${ticket.ticketId}`,
      description: ticket.subject,
      priority: ticket.priority === 'high' ? 'high' : 'medium',
      createdAt: ticket.createdAt,
      ...ticketRoute(ticket.status),
    })),
    ...lowStock.slice(0, 5).map((item) => ({
      id: `stock-${item._id}`,
      type: 'inventory',
      title: `Low stock: ${item.name}`,
      description: `${item.available || 0} available · reorder at ${item.reorderLevel || 0}`,
      priority: Number(item.available || 0) === 0 ? 'high' : 'medium',
      createdAt: item.updatedAt,
      route: '/manager/analytics/inventory-exception-control',
      queryParams: {},
    })),
  ].sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority)
      || new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .slice(0, 12);

  return {
    managerName: user?.fullName || 'Manager',
    currentDate: now,
    status: 'Operational',
    stats,
    inventoryKpis: {
      reservedItems: { label: 'Reserved Items', value: reservedItems, icon: 'clipboard-check' },
      lowStockAlerts: { label: 'Low Stock Alerts', value: lowStock.length, icon: 'triangle-alert' },
      pendingMaterialRequests: { label: 'Pending Material Requests', value: materialRequests.length, icon: 'package-clock' },
    },
    recentActivity,
    pendingActions,
  };
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
