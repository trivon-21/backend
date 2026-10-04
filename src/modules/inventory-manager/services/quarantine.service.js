const mongoose = require('mongoose');
const QuarantineItem = require('../../../models/QuarantineItem');
const Inventory = require('../../../models/Inventory');
const Activity = require('../../../models/Activity');
const { legacyStockStatus } = require('../../../utils/inventory-domain');
const {
  serviceError,
  assertRole,
  actorName,
  generateId,
  runInTransaction,
} = require('./shared');
const {
  inventoryCache,
  invalidateInventoryCache,
  INVENTORY_CACHE_PREFIXES,
} = require('../inventory-manager.cache');

/**
 * Fetches all active quarantine items (status = 'quarantined').
 */
exports.getQuarantineItems = async () => {
  return await inventoryCache.get(`${INVENTORY_CACHE_PREFIXES.QUARANTINE}items`, async () => {
    return await QuarantineItem.find({ status: 'quarantined' }).sort({ createdAt: -1 }).lean();
  });
};

/**
 * Manually adds an item to the quarantine zone.
 */
exports.createQuarantineItem = async (data, user, options = {}) => {
  assertRole(user, ['INVENTORY']);
  const quarantineId = generateId('QZ');
  const quantity = Number(data.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0 || !String(data.itemName || '').trim() || !String(data.reason || '').trim()) {
    throw serviceError('Item name, reason and a positive whole quantity are required', 400, 'INVALID_QUARANTINE_ITEM');
  }

  const itemId = data.itemId || data.inventoryId;
  let inventoryItem = null;
  if (itemId) {
    if (!mongoose.isValidObjectId(itemId)) {
      throw serviceError('Invalid inventory item reference', 400, 'INVALID_INVENTORY_REF');
    }
    inventoryItem = await Inventory.findById(itemId).lean();
    if (!inventoryItem) {
      throw serviceError('Linked inventory item not found', 404, 'ITEM_NOT_FOUND');
    }
  }

  const result = await runInTransaction(async (session) => {
    const sessionOpt = session ? { session } : {};
    const quarantineItem = new QuarantineItem({
      quarantineId,
      itemName: data.itemName,
      quantity,
      unit: data.unit || 'units',
      reason: data.reason,
      location: data.location || '',
      source: 'manual',
      sourceRefId: '',
      inventoryId: inventoryItem ? inventoryItem._id : undefined,
    });

    const saved = await quarantineItem.save(sessionOpt);

    await Activity.create([{
      type: 'alert',
      title: 'Item Quarantined',
      description: `${quantity} ${data.unit || 'units'} of ${data.itemName} added to quarantine: ${data.reason}`,
      actionLabel: 'View Quarantine',
    }], sessionOpt);

    return saved;
  }, options.session);
  invalidateInventoryCache();
  return result;
};

/**
 * Executes atomic quarantine item disposal (permanent removal) and activity record.
 */
async function executeDisposal(query, user, session) {
  const sessionOpt = session ? { session } : {};
  const disposedItem = await QuarantineItem.findOneAndDelete(
    {
      ...query,
      status: 'quarantined',
    },
    sessionOpt
  );

  if (!disposedItem) {
    const existing = await QuarantineItem.findOne(query, null, sessionOpt);
    if (!existing) {
      throw serviceError('Quarantine item not found', 404, 'QUARANTINE_NOT_FOUND');
    }
    throw serviceError('Quarantine item is no longer in quarantine', 409, 'QUARANTINE_ALREADY_DISPOSED');
  }

  await Activity.create([{
    type: 'alert',
    title: 'Quarantine Item Disposed',
    description: `${disposedItem.quantity} ${disposedItem.unit || 'units'} of ${disposedItem.itemName} permanently disposed and removed by ${actorName(user, 'Inventory Manager')}`,
    actionLabel: 'View Quarantine',
  }], sessionOpt);

  return disposedItem;
}

/**
 * Disposes a quarantine item — permanently removes it from the system (scrap/write-off).
 */
exports.disposeQuarantineItem = async (id, user, options = {}) => {
  assertRole(user, ['INVENTORY']);
  const query = mongoose.isValidObjectId(id)
    ? { $or: [{ _id: id }, { quarantineId: id }] }
    : { quarantineId: id };

  const result = await runInTransaction((session) => executeDisposal(query, user, session), options.session);
  invalidateInventoryCache();
  return result;
};

/**
 * Returns a quarantine item's stock back to inventory and removes it from quarantine.
 */
exports.deleteQuarantineItem = async (id, user, options = {}) => {
  assertRole(user, ['INVENTORY']);
  const query = mongoose.isValidObjectId(id)
    ? { $or: [{ _id: id }, { quarantineId: id }] }
    : { quarantineId: id };

  const result = await runInTransaction(async (session) => {
    const sessionOpt = session ? { session } : {};
    const item = await QuarantineItem.findOne({ ...query, status: 'quarantined' }, null, sessionOpt);
    if (!item) {
      const existing = await QuarantineItem.findOne(query, null, sessionOpt);
      if (!existing) {
        throw serviceError('Quarantine item not found', 404, 'QUARANTINE_NOT_FOUND');
      }
      throw serviceError('Quarantine item is no longer in quarantine', 409, 'QUARANTINE_ALREADY_DISPOSED');
    }

    if (!item.inventoryId) {
      throw serviceError(
        'This quarantine item is not linked to an inventory record and cannot be automatically returned to stock',
        409,
        'QUARANTINE_NO_INVENTORY_LINK'
      );
    }

    const stock = await Inventory.findByIdAndUpdate(
      item.inventoryId,
      { $inc: { available: item.quantity } },
      { returnDocument: 'after', runValidators: true, ...sessionOpt }
    );
    if (!stock) {
      throw serviceError('Linked inventory item no longer exists', 404, 'ITEM_NOT_FOUND');
    }
    stock.status = legacyStockStatus(stock.available, stock.reorderLevel);
    await stock.save(sessionOpt);

    await QuarantineItem.deleteOne({ _id: item._id }, sessionOpt);

    await Activity.create([{
      type: 'return',
      title: 'Quarantine Item Returned to Stock',
      description: `${item.quantity} ${item.unit || 'units'} of ${item.itemName} returned to inventory from quarantine by ${actorName(user, 'Inventory Manager')}`,
      actionLabel: 'View Inventory',
    }], sessionOpt);

    return item;
  }, options.session);
  invalidateInventoryCache();
  return result;
};
