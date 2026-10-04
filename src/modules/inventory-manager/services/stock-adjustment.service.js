const Inventory = require('../../../models/Inventory');
const StockMovement = require('../../../models/StockMovement');
const Activity = require('../../../models/Activity');
const { STOCK_STATUS_PIPELINE_EXPR } = require('../../../utils/inventory-domain');
const {
  serviceError,
  assertRole,
  assertObjectId,
  actorName,
  generateId,
  runInTransaction,
} = require('./shared');
const {
  inventoryCache,
  invalidateInventoryCache,
  INVENTORY_CACHE_PREFIXES,
} = require('../inventory-manager.cache');

// Adjustments only ever move `available` — `reserved` is owned exclusively
// by the material-request reserve/release/handover workflow, and drift
// there is a data-repair concern (see scripts/), not something this
// endpoint should be able to touch.
const ADJUSTMENT_REASONS = {
  OPENING_BALANCE: { requiresNote: false },
  CYCLE_COUNT_VARIANCE: { requiresNote: true },
  SHRINKAGE: { requiresNote: true },
  DAMAGE: { requiresNote: true },
  DATA_CORRECTION: { requiresNote: true },
};

/**
 * Resolves a `{ mode, quantity }` adjustment request against the item's
 * current available quantity into a signed delta and the resulting total.
 * Pure — no I/O — so it can be unit-tested without a database.
 */
function resolveAdjustment({ mode, quantity, currentAvailable, reasonCode }) {
  if (!ADJUSTMENT_REASONS[reasonCode]) {
    throw serviceError('Select a valid adjustment reason', 400, 'INVALID_ADJUSTMENT_REASON');
  }
  if (mode !== 'SET' && mode !== 'DELTA') {
    throw serviceError('Adjustment mode must be SET or DELTA', 400, 'INVALID_ADJUSTMENT');
  }
  const qty = Number(quantity);
  if (!Number.isInteger(qty)) {
    throw serviceError('Adjustment quantity must be a whole number', 400, 'INVALID_ADJUSTMENT');
  }
  if (mode === 'SET' && qty < 0) {
    throw serviceError('Counted quantity cannot be negative', 400, 'INVALID_ADJUSTMENT');
  }
  if (mode === 'DELTA' && qty === 0) {
    throw serviceError('Adjustment quantity cannot be zero', 400, 'INVALID_ADJUSTMENT');
  }
  const availableAfter = mode === 'SET' ? qty : currentAvailable + qty;
  if (availableAfter < 0) {
    throw serviceError('Adjustment would drop available stock below zero', 409, 'NEGATIVE_STOCK_NOT_ALLOWED');
  }
  return { availableDelta: availableAfter - currentAvailable, availableAfter };
}

/**
 * Writes one StockMovement row and, when it changes stock, an Activity row.
 * Every writer in the module (adjustments now, reserve/release/handover,
 * quarantine, receipts, leftover returns in later phases) shares this
 * helper so the ledger stays uniform.
 */
async function recordMovement(session, {
  inventoryId, sku, itemName, movementType, reasonCode = '',
  availableDelta, reservedDelta, availableAfter, reservedAfter,
  sourceType, sourceRefId = '', movementEventId, note = '', user,
}) {
  const [movement] = await StockMovement.create([{
    movementId: generateId('SM'),
    inventoryId,
    sku,
    itemName,
    movementType,
    reasonCode,
    availableDelta,
    reservedDelta,
    availableAfter,
    reservedAfter,
    sourceType,
    sourceRefId,
    movementEventId,
    note,
    actorId: user?._id,
    actorName: actorName(user, 'Inventory Manager'),
  }], { session });
  return movement;
}
exports.recordMovement = recordMovement;

/**
 * Establishes or corrects an item's on-hand quantity through an audited
 * workflow, so a catalog item that was never received against a PO/NON-PO
 * receipt (and therefore sits at available: 0 forever) can be given an
 * opening balance without relaxing rejectProtectedStockFields.
 */
exports.adjustStock = async (data, user, options = {}) => {
  assertRole(user, ['INVENTORY']);
  assertObjectId(data.inventoryId, 'Inventory reference is invalid', 'INVALID_ID');
  const reasonCode = String(data.reasonCode || '');
  const rule = ADJUSTMENT_REASONS[reasonCode];
  if (!rule) throw serviceError('Select a valid adjustment reason', 400, 'INVALID_ADJUSTMENT_REASON');
  const note = String(data.note || '').trim();
  if (rule.requiresNote && !note) {
    throw serviceError('A note is required for this adjustment reason', 400, 'ADJUSTMENT_NOTE_REQUIRED');
  }
  if (data.expectedAvailable === undefined || data.expectedAvailable === null) {
    throw serviceError('The current available quantity must be supplied for concurrency safety', 400, 'INVALID_ADJUSTMENT');
  }
  const expectedAvailable = Number(data.expectedAvailable);

  const result = await runInTransaction(async (session) => {
    const item = await Inventory.findById(data.inventoryId).session(session);
    if (!item) throw serviceError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
    if (item.isSerialized) {
      throw serviceError(
        'Serialized items track stock through receipts and the asset registry, not manual adjustment',
        409,
        'SERIALIZED_ITEM_NOT_ALLOWED',
      );
    }

    if (data.adjustmentEventId) {
      const existing = await StockMovement.findOne({ movementEventId: data.adjustmentEventId }).session(session);
      if (existing) return { item, movement: existing, duplicate: true };
    }

    const { availableDelta, availableAfter } = resolveAdjustment({
      mode: data.mode,
      quantity: data.quantity,
      currentAvailable: Number(item.available),
      reasonCode,
    });

    const updated = await Inventory.findOneAndUpdate(
      { _id: item._id, available: expectedAvailable },
      [
        { $set: { available: availableAfter } },
        { $set: { status: STOCK_STATUS_PIPELINE_EXPR } },
      ],
      { returnDocument: 'after', session, updatePipeline: true },
    );
    if (!updated) {
      throw serviceError('Stock changed since this item was loaded; reload and try again', 409, 'STOCK_CHANGED');
    }

    const movement = await recordMovement(session, {
      inventoryId: updated._id,
      sku: updated.sku,
      itemName: updated.name,
      movementType: availableDelta >= 0 ? 'ADJUSTMENT' : 'WRITE_OFF',
      reasonCode,
      availableDelta,
      reservedDelta: 0,
      availableAfter: updated.available,
      reservedAfter: updated.reserved,
      sourceType: 'MANUAL',
      movementEventId: data.adjustmentEventId,
      note,
      user,
    });

    await Activity.create([{
      // Activity.type is a closed enum; reuse 'grn' (stock increasing, same
      // family as a goods receipt) / 'alert' (stock decreasing) rather than
      // adding a new type, which would also need dashboard.service.js updated.
      type: availableDelta >= 0 ? 'grn' : 'alert',
      title: availableDelta >= 0 ? 'Stock Adjusted' : 'Stock Written Off',
      description: `${updated.sku}: ${availableDelta >= 0 ? '+' : ''}${availableDelta} (${reasonCode}) by ${actorName(user, 'Inventory Manager')}`,
      actionLabel: 'View Item',
    }], { session });

    return { item: updated, movement, duplicate: false };
  }, options.session);

  invalidateInventoryCache();
  return result;
};

exports.getStockMovements = async (query = {}) => {
  const cacheKey = `${INVENTORY_CACHE_PREFIXES.CATALOG}movements:${query.inventoryId || 'all'}:${query.movementType || 'all'}:${query.limit || 100}`;
  return inventoryCache.get(cacheKey, async () => {
    const filter = {};
    if (query.inventoryId) filter.inventoryId = query.inventoryId;
    if (query.movementType) filter.movementType = query.movementType;
    const limit = Math.min(Number(query.limit) || 100, 500);
    return StockMovement.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  });
};

// Same ledger, filtered to manual adjustments/write-offs only — the read
// side of POST /stock-adjustments.
exports.getStockAdjustments = async (query = {}) => {
  const cacheKey = `${INVENTORY_CACHE_PREFIXES.CATALOG}adjustments:${query.inventoryId || 'all'}:${query.limit || 100}`;
  return inventoryCache.get(cacheKey, async () => {
    const filter = { movementType: { $in: ['ADJUSTMENT', 'WRITE_OFF'] } };
    if (query.inventoryId) filter.inventoryId = query.inventoryId;
    const limit = Math.min(Number(query.limit) || 100, 500);
    return StockMovement.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  });
};

exports.ADJUSTMENT_REASONS = ADJUSTMENT_REASONS;
exports.resolveAdjustment = resolveAdjustment;
