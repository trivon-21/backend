const DispatchOrder = require('../../../models/DispatchOrder');
const Inventory = require('../../../models/Inventory');
const Activity = require('../../../models/Activity');
const { buildDispatchMutation } = require('../../../utils/dispatch-workflow');
const {
  serviceError, runInTransaction, assertRole, actorName, generateReference,
} = require('./shared');
const {
  inventoryCache,
  invalidateInventoryCache,
  invalidateInventoryScopes,
  INVENTORY_CACHE_PREFIXES,
} = require('../inventory-manager.cache');

// Buy-only customer orders never reserve stock when they're queued for
// packing (unlike material requests, which reserve on the earlier `reserved`
// step) — so the units must leave Inventory.available here, when the order is
// actually packed and set out for pickup. Purchase-order dispatches move no
// stock of ours; they're outbound to the supplier, not out of our warehouse.
async function shiftDispatchStock(items, sign, session) {
  for (const item of items) {
    const delta = sign * item.qty;
    const query = { sku: item.sku };
    if (sign < 0) query.available = { $gte: item.qty };
    const updated = await Inventory.findOneAndUpdate(
      query,
      { $inc: { available: delta } },
      { session },
    );
    if (!updated && sign < 0) {
      throw serviceError(`Insufficient stock for ${item.sku}`, 409, 'INSUFFICIENT_STOCK');
    }
  }
}

/**
 * Retrieves all orders sorted by creation date.
 */
exports.getOrders = async () => {
  return await inventoryCache.get(`${INVENTORY_CACHE_PREFIXES.DISPATCH}orders`, async () => {
    return await DispatchOrder.find().sort({ createdAt: -1 }).lean();
  });
};

/**
 * Queues an issued purchase order for packing by creating its dispatch record.
 */
exports.createDispatchOrderFromPurchase = async (request, user, sessionOpt = {}) => {
  const [dispatchOrder] = await DispatchOrder.create([{
    orderId: generateReference('DSP'),
    sourceOrderId: request._id,
    sourceOrderType: 'PurchaseRequest',
    customer: request.supplierName || 'Unknown Supplier',
    date: new Date().toISOString(),
    type: 'Purchase Order',
    items: request.items.map((item) => ({
      name: item.name,
      sku: item.sku,
      qty: item.orderedQuantity || item.quantity,
    })),
  }], sessionOpt);
  await Activity.create([{
    type: 'dispatch',
    title: 'Purchase Order Queued for Packing',
    description: `${dispatchOrder.orderId}: ${request.poNumber} from ${request.supplierName || 'supplier'} by ${actorName(user, 'Inventory Manager')}`,
    actionLabel: 'View Dispatch',
  }], sessionOpt);
  return dispatchOrder;
};

/**
 * Queues a Finance-approved customer "Buy Only" order for packing. Only the
 * buy_only line items ship from the warehouse — buy_and_install items are
 * handled by the installation workflow. No-ops if a dispatch record already
 * exists for this order (approvePayment has no re-approval guard) or if the
 * order has no buy_only items.
 */
exports.createDispatchOrderFromOrder = async (order, customerName) => {
  const buyOnlyItems = (order.items || []).filter((item) => item.purchaseType === 'buy_only');
  if (!buyOnlyItems.length) return null;

  const alreadyQueued = await DispatchOrder.exists({
    sourceOrderId: order._id,
    sourceOrderType: 'Order',
  });
  if (alreadyQueued) return null;

  const [dispatchOrder] = await DispatchOrder.create([{
    orderId: generateReference('DSP'),
    sourceOrderId: order._id,
    sourceOrderType: 'Order',
    customer: customerName || 'Unknown Customer',
    date: new Date().toISOString(),
    type: 'Buy Only Order',
    items: buyOnlyItems.map((item) => ({
      name: item.name,
      sku: item.productId || item.name,
      qty: item.quantity,
    })),
  }]);
  const orderRef = order.orderReference || order.orderRef || order._id.toString();
  await Activity.create([{
    type: 'dispatch',
    title: 'Customer Order Queued for Packing',
    description: `${dispatchOrder.orderId}: ${orderRef} for ${customerName || 'customer'}`,
    actionLabel: 'View Dispatch',
  }]);
  return dispatchOrder;
};

/**
 * Updates an order's details and manages status-related timestamps.
 */
exports.updateOrder = async (id, data, user, options = {}) => {
  assertRole(user, ['INVENTORY']);
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
    let stockMoved = false;
    if (mutation.transitioned && order.sourceOrderType === 'Order') {
      if (mutation.previousStatus === 'to-pack' && mutation.nextStatus === 'ready') {
        await shiftDispatchStock(order.items, -1, session);
        stockMoved = true;
      } else if (mutation.previousStatus === 'ready' && mutation.nextStatus === 'to-pack') {
        await shiftDispatchStock(order.items, 1, session);
        stockMoved = true;
      }
    }
    if (mutation.transitioned) {
      await Activity.create([{
        type: 'dispatch',
        title: data.undo === true ? 'Dispatch Stage Restored' : 'Dispatch Stage Advanced',
        description: `${order.orderId}: ${mutation.previousStatus} → ${mutation.nextStatus} by ${actorName(user, 'Inventory Manager')}`,
        actionLabel: 'View Dispatch',
      }], sessionOpt);
    }
    return { updated, stockMoved };
  }, options.session);
  if (result.stockMoved) {
    invalidateInventoryCache();
  } else {
    invalidateInventoryScopes(
      INVENTORY_CACHE_PREFIXES.DISPATCH,
      INVENTORY_CACHE_PREFIXES.DASHBOARD,
      INVENTORY_CACHE_PREFIXES.ACTIVITY,
    );
  }
  return result.updated;
};
