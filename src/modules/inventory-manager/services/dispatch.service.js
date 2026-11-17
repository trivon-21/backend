const DispatchOrder = require('../../../models/DispatchOrder');
const Activity = require('../../../models/Activity');
const { buildDispatchMutation } = require('../../../utils/dispatch-workflow');
const { serviceError, runInTransaction } = require('./shared');
const {
  inventoryCache,
  invalidateInventoryScopes,
  INVENTORY_CACHE_PREFIXES,
} = require('../inventory-manager.cache');

/**
 * Retrieves all orders sorted by creation date.
 */
exports.getOrders = async () => {
  return await inventoryCache.get(`${INVENTORY_CACHE_PREFIXES.DISPATCH}orders`, async () => {
    return await DispatchOrder.find().sort({ createdAt: -1 }).lean();
  });
};

/**
 * Updates an order's details and manages status-related timestamps.
 */
exports.updateOrder = async (id, data, options = {}) => {
  const result = await runInTransaction(async (session) => {
    const sessionOpt = session ? { session } : {};
    const order = await DispatchOrder.findOne({ orderId: id }).session(session || null).lean();
    if (!order) throw serviceError('Dispatch order not found', 404, 'DISPATCH_NOT_FOUND');
    const mutation = buildDispatchMutation(order, data);
    const update = { $set: mutation.set, $inc: { statusVersion: 1 } };
    if (Object.keys(mutation.unset).length) update.$unset = mutation.unset;
    const updated = await DispatchOrder.findOneAndUpdate({
      _id: order._id,
      status: order.status,
      statusVersion: data.statusVersion,
    }, update, { returnDocument: 'after', runValidators: true, ...sessionOpt });
    if (!updated) throw serviceError('This dispatch changed; refresh before trying again', 409, 'STALE_DISPATCH');
    if (mutation.transitioned) {
      await Activity.create([{
        type: 'dispatch',
        title: data.undo === true ? 'Dispatch Stage Restored' : 'Dispatch Stage Advanced',
        description: `${order.orderId}: ${mutation.previousStatus} → ${mutation.nextStatus}`,
        actionLabel: 'View Dispatch',
      }], sessionOpt);
    }
    return updated;
  }, options.session);
  // Advancing a dispatch stage moves no stock — the reservation already did.
  invalidateInventoryScopes(
    INVENTORY_CACHE_PREFIXES.DISPATCH,
    INVENTORY_CACHE_PREFIXES.DASHBOARD,
    INVENTORY_CACHE_PREFIXES.ACTIVITY,
  );
  return result;
};
