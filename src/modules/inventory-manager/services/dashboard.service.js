const mongoose = require('mongoose');
const Inventory = require('../../../models/Inventory');
const Activity = require('../../../models/Activity');
const DispatchOrder = require('../../../models/DispatchOrder');
const AssetLoan = require('../../../models/AssetLoan');
const WarehousePickRequest = require('../../../models/WarehousePickRequest');
const PurchaseRequest = require('../../../models/PurchaseRequest');
const ReceiptAuthorization = require('../../../models/ReceiptAuthorization');
const {
  deriveStockStatus,
  legacyStockStatus,
  isLowStock,
  isLoanOverdue,
} = require('../../../utils/inventory-domain');
const { summarizeProcurementWorkflow } = require('../../../utils/purchase-workflow');

/**
 * Retrieves aggregated dashboard data including inventory stats, recent activity, and logistics status.
 */
exports.getDashboardData = async (user) => {
  const [inventory, activities, orders, loans, materialRequests, orderRequests, authorizations] = await Promise.all([
    Inventory.find(),
    Activity.find({
      type: { $in: ['return', 'dispatch', 'request', 'grn', 'alert'] },
    }).sort({ timestamp: -1 }).limit(10),
    DispatchOrder.find(),
    AssetLoan.find({ status: { $ne: 'returned' } }),
    WarehousePickRequest.find(),
    PurchaseRequest.find().lean(),
    ReceiptAuthorization.find().lean(),
  ]);

  // Aggregate stats for dashboard tiles
  const pendingRequestsCount = materialRequests.filter(r => r.status === 'pending').length;
  const reservedRequestsCount = materialRequests.filter(r => r.status === 'reserved').length;

  const stats = {
    materialReservations: {
      total: pendingRequestsCount + reservedRequestsCount,
      subStats: [
        { label: 'Pending Requests', value: pendingRequestsCount },
        { label: 'Reserved/Kitted', value: reservedRequestsCount },
      ],
    },
    dispatchQueue: {
      total: orders.filter(o => o.status === 'to-pack' || o.status === 'ready').length,
      subStats: [
        { label: 'To Pack', value: orders.filter(o => o.status === 'to-pack').length },
        { label: 'Ready for Pickup', value: orders.filter(o => o.status === 'ready').length },
      ],
    },
    assetHealth: {
      total: loans.length,
      subStats: [
        { label: 'Tools in Field', value: loans.length },
        { label: 'Overdue Returns', value: loans.filter((l) => isLoanOverdue(l.dueDate)).length },
      ],
    },
    stockAlerts: {
      total: inventory.filter(isLowStock).length,
      subStats: [
        { label: 'Below Reorder', value: inventory.filter(i => deriveStockStatus(i.available, i.reorderLevel) === 'low-stock').length },
        { label: 'Out of Stock', value: inventory.filter(i => deriveStockStatus(i.available, i.reorderLevel) === 'out-of-stock').length },
      ],
    },
  };

  const reorderList = inventory
    .filter(isLowStock)
    .map(i => ({
      id: i._id,
      name: i.name,
      available: i.available,
      reserved: i.reserved,
      status: legacyStockStatus(i.available, i.reorderLevel),
      stockStatus: deriveStockStatus(i.available, i.reorderLevel),
    }));

  const inventoryIds = new Set(inventory.map((item) => String(item._id)));
  const procurementWorkflow = summarizeProcurementWorkflow(orderRequests, authorizations, { inventoryIds });

  const logistics = orders
    .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0))
    .map(o => ({
      id: o.orderId,
      orderId: o.orderId,
      customer: o.customer,
      status: o.status,
      statusVersion: o.statusVersion ?? 0,
      type: o.type,
      courier: o.courier || '',
      trackId: o.trackId || '',
      itemCount: Array.isArray(o.items) ? o.items.length : 0,
      date: o.date,
      lastMovedAt: o.lastMovedAt,
      completedAt: o.completedAt,
    }));

  return {
    managerName: user?.fullName?.split(' ')[0] || 'Manager',
    currentDate: new Date(),
    status: mongoose.connection.readyState === 1 ? 'Operational' : 'Offline',
    stats,
    recentActivity: activities.map(a => ({
      id: a._id,
      type: a.type,
      title: a.title,
      description: a.description,
      timestamp: a.timestamp,
      actionLabel: a.actionLabel,
    })),
    reorderList,
    procurementWorkflow,
    logistics,
  };
};

/**
 * Retrieves the global activity log for inventory and logistics events.
 */
exports.getActivityLog = async () => {
  return await Activity.find({
    type: { $in: ['return', 'dispatch', 'request', 'grn', 'alert'] },
  }).sort({ timestamp: -1 });
};
