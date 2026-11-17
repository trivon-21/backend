const mongoose = require('mongoose');
const QuarantineItem = require('../../../models/QuarantineItem');
const Activity = require('../../../models/Activity');
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
 * Executes atomic quarantine item disposal and activity record.
 */
async function executeDisposal(query, user, session) {
  const sessionOpt = session ? { session } : {};
  const updatedItem = await QuarantineItem.findOneAndUpdate(
    {
      ...query,
      status: 'quarantined',
    },
    {
      $set: {
        status: 'disposed',
        disposedAt: new Date(),
        disposedBy: actorName(user, 'Inventory Manager'),
      },
    },
    { returnDocument: 'after', ...sessionOpt }
  );

  if (!updatedItem) {
    const existing = await QuarantineItem.findOne(query, null, sessionOpt);
    if (!existing) {
      throw serviceError('Quarantine item not found', 404, 'QUARANTINE_NOT_FOUND');
    }
    throw serviceError('Quarantine item is already disposed', 409, 'QUARANTINE_ALREADY_DISPOSED');
  }

  await Activity.create([{
    type: 'alert',
    title: 'Quarantine Item Disposed',
    description: `${updatedItem.quantity} ${updatedItem.unit || 'units'} of ${updatedItem.itemName} disposed from quarantine`,
    actionLabel: 'View Quarantine',
  }], sessionOpt);

  return updatedItem;
}

/**
 * Disposes a quarantine item — updates status and records audit trail.
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
