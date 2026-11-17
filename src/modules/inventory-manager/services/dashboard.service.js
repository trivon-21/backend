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
  isLoanDueWithinDays,
} = require('../../../utils/inventory-domain');
const { summarizeProcurementWorkflow } = require('../../../utils/purchase-workflow');
const { inventoryCache } = require('../inventory-manager.cache');

const DASHBOARD_CACHE_KEY = 'inventory:dashboard';
const ACTIVITY_CACHE_KEY = 'inventory:activity';

/**
 * Retrieves aggregated dashboard data including inventory stats, recent activity, and logistics status.
 */
exports.getDashboardData = async (user) => {
  if (mongoose.connection.readyState !== 1) {
    const error = new Error('Inventory dashboard is unavailable while the database is offline');
    error.statusCode = 503;
    error.code = 'DATABASE_OFFLINE';
    throw error;
  }

  const cachedPayload = await inventoryCache.get(DASHBOARD_CACHE_KEY, async () => {
    const [inventory, activities, orders, loans, materialRequests, orderRequests, authorizations] = await Promise.all([
      Inventory.find().select('name available reserved reorderLevel').lean(),
      Activity.find({
        type: { $in: ['return', 'dispatch', 'request', 'grn', 'alert'] },
      }).sort({ timestamp: -1 }).limit(10).select('type title timestamp actionLabel').lean(),
      DispatchOrder.find().select('orderId customer status courier trackId date lastMovedAt createdAt').lean(),
      AssetLoan.find({ status: { $ne: 'returned' } }).select('status dueDate').lean(),
      WarehousePickRequest.find({ status: { $ne: 'cancelled' } }).select('status').lean(),
      PurchaseRequest.find().select('status items').lean(),
      ReceiptAuthorization.find().select('status authorizedQuantity receivedQuantity inventoryId newItemSnapshot financeReviewStatus').lean(),
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
          { label: 'Overdue Returns', value: loans.filter((l) => isLoanOverdue(l.dueDate)).length },
          { label: 'Due This Week', value: loans.filter((l) => isLoanDueWithinDays(l.dueDate, 7)).length },
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
      }));

    const procurementWorkflow = summarizeProcurementWorkflow(orderRequests, authorizations);

    const LOGISTICS_DASHBOARD_LIMIT = 15;
    const logistics = orders
      .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0))
      .slice(0, LOGISTICS_DASHBOARD_LIMIT)
      .map(o => ({
        orderId: o.orderId,
        customer: o.customer,
        status: o.status,
        courier: o.courier || '',
        trackId: o.trackId || '',
        date: o.date,
        lastMovedAt: o.lastMovedAt,
      }));

    return {
      status: 'Operational',
      stats,
      recentActivity: activities.map(a => ({
        id: a._id,
        type: a.type,
        title: a.title,
        timestamp: a.timestamp,
        actionLabel: a.actionLabel,
      })),
      reorderList,
      procurementWorkflow,
      logistics,
    };
  });

  return {
    ...cachedPayload,
    managerName: user?.fullName?.split(' ')[0] || 'Manager',
    currentDate: new Date(),
  };
};

/**
 * Retrieves the global activity log for inventory and logistics events.
 */
exports.getActivityLog = async () => {
  return await inventoryCache.get(ACTIVITY_CACHE_KEY, async () => {
    return await Activity.find({
      type: { $in: ['return', 'dispatch', 'request', 'grn', 'alert'] },
    }).sort({ timestamp: -1 }).lean();
  });
};

