const mongoose = require('mongoose');
const Inventory = require('../../../models/Inventory');
const Supplier = require('../../../models/Supplier');
const SerializedAsset = require('../../../models/SerializedAsset');
const PurchaseRequest = require('../../../models/PurchaseRequest');
const {
  INVENTORY_LOCATIONS,
  legacyStockStatus,
  deriveStockStatus,
  suggestedOrderQuantity,
} = require('../../../utils/inventory-domain');
const {
  ACTIVE_INCOMING_STATUSES,
  outstandingQuantity,
} = require('../../../utils/purchase-workflow');
const {
  serviceError,
  normalizeInventoryData,
  pickMasterData,
  validateCatalogData,
  rejectProtectedStockFields,
  projectSerialNumbers,
  runInTransaction,
} = require('./shared');
const {
  inventoryCache,
  invalidateInventoryCache,
  invalidateInventoryScopes,
  INVENTORY_CACHE_PREFIXES,
} = require('../inventory-manager.cache');

const ALLOWED_SORT_FIELDS = new Set(['name', 'sku', 'available', 'status', 'updatedAt', 'brand', 'itemClass']);
const DEFAULT_PAGE_SIZE = 50;

/**
 * Fetches inventory items.
 *
 * When called without params (or with an empty object) returns the full flat
 * array — backward compatible with all existing callers.
 *
 * When pagination params are present returns:
 *   { items, page, pageSize, total, totalPages }
 *
 * @param {Object} [params]
 * @param {number} [params.page=1]
 * @param {number} [params.pageSize=50]
 * @param {string} [params.search]        Case-insensitive match on name/sku/brand.
 * @param {string} [params.itemClass]     Exact match filter.
 * @param {string} [params.subcategory]   Exact match filter.
 * @param {string} [params.supplierId]    Exact ObjectId match.
 * @param {string} [params.sortField=name]
 * @param {'asc'|'desc'} [params.sortDirection='asc']
 */
exports.getInventoryList = async (params) => {
  const isPaginated = params && (
    params.page !== undefined ||
    params.pageSize !== undefined ||
    params.search !== undefined ||
    params.itemClass !== undefined ||
    params.subcategory !== undefined ||
    params.supplierId !== undefined ||
    params.sortField !== undefined
  );

  if (!isPaginated) {
    return await inventoryCache.get('inventory:catalog:list', async () => {
      const items = await Inventory.find().populate('supplierId', 'name').sort({ name: 1 });
      return projectSerialNumbers(items);
    });
  }

  // Build filter
  const filter = {};
  if (params.search && String(params.search).trim()) {
    const re = new RegExp(String(params.search).trim().replace(/[$()*+.?[\\\]^{|}]/g, '\\$&'), 'i');
    filter.$or = [{ name: re }, { sku: re }, { brand: re }, { description: re }];
  }
  if (params.itemClass) filter.itemClass = params.itemClass;
  if (params.subcategory) filter.subcategory = params.subcategory;
  if (params.supplierId && mongoose.isValidObjectId(params.supplierId)) {
    filter.supplierId = params.supplierId;
  }

  // Sort
  const sortField = ALLOWED_SORT_FIELDS.has(params.sortField) ? params.sortField : 'name';
  const sortDir = params.sortDirection === 'desc' ? -1 : 1;

  // Pagination
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(params.pageSize) || DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    Inventory.find(filter).populate('supplierId', 'name').sort({ [sortField]: sortDir }).skip(skip).limit(pageSize),
    Inventory.countDocuments(filter),
  ]);

  return {
    items: projectSerialNumbers(items),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
};


/**
 * Retrieves a single inventory item by its ID.
 */
exports.getInventoryItem = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  const item = await Inventory.findById(id).populate('supplierId', 'name');
  return projectSerialNumbers(item);
};

exports.getInventoryLocations = () => INVENTORY_LOCATIONS.map((location) => ({
  warehouse: location.warehouse,
  warehouseLabel: location.warehouseLabel,
  racks: location.racks.map((rack) => ({ rackTag: rack.rackTag, bins: [...rack.bins] })),
}));

/**
 * Updates an existing inventory item.
 */
exports.updateInventoryItem = async (id, data) => {
  if (!mongoose.isValidObjectId(id)) return null;
  const existing = await Inventory.findById(id);
  if (!existing) return null;

  rejectProtectedStockFields(data);
  if (Object.prototype.hasOwnProperty.call(data, 'sku')) {
    throw serviceError('SKU cannot be changed after product creation', 400, 'IMMUTABLE_SKU');
  }
  const update = normalizeInventoryData(pickMasterData(data), false);
  const merged = { ...existing.toObject(), ...update };
  await validateCatalogData(merged);
  if (update.isSerialized !== undefined && update.isSerialized !== existing.isSerialized
    && (existing.available > 0 || existing.serialNumbers.length > 0
      || await SerializedAsset.exists({ inventoryId: existing._id, status: { $ne: 'retired' } }))) {
    throw serviceError('Serialized tracking cannot change while stock or asset tags exist', 409, 'SERIALIZATION_LOCKED');
  }
  update.status = legacyStockStatus(existing.available, update.reorderLevel ?? existing.reorderLevel);

  existing.set(update);
  await existing.save();
  await existing.populate('supplierId', 'name');
  invalidateInventoryCache();
  return projectSerialNumbers(existing);
};

/**
 * Creates a new inventory item and calculates its initial stock status.
 */
exports.createInventoryItem = async (data, user, options = {}) => {
  rejectProtectedStockFields(data);
  if (!String(data.sku || '').trim()) throw serviceError('sku is required', 400, 'VALIDATION_ERROR');
  const normalizedData = normalizeInventoryData({ ...pickMasterData(data), sku: String(data.sku).trim() });
  await validateCatalogData(normalizedData);
  const created = await runInTransaction(async (session) => {
    const sessionOpt = session ? { session } : {};
    if (await Inventory.exists({ sku: normalizedData.sku }).session(session || null)) {
      throw serviceError('SKU already exists', 409, 'DUPLICATE_SKU');
    }
    return await new Inventory({
      ...normalizedData,
      available: 0,
      reserved: 0,
      serialNumbers: [],
      status: legacyStockStatus(0, normalizedData.reorderLevel),
    }).save(sessionOpt);
  }, options.session);
  invalidateInventoryCache();
  return created;
};

/**
 * Retrieves all registered suppliers sorted by name.
 */
exports.getSuppliersList = async () => {
  return await Supplier.find().sort({ name: 1 });
};

/**
 * Registers a new supplier in the system.
 */
exports.createSupplier = async (name) => {
  const normalizedName = String(name || '').trim();
  if (!normalizedName) throw serviceError('Supplier name is required', 400, 'SUPPLIER_NAME_REQUIRED');
  const newSupplier = new Supplier({ name: normalizedName });
  const saved = await newSupplier.save();
  // A new supplier changes no stock, only the pickers that list suppliers.
  invalidateInventoryScopes(
    INVENTORY_CACHE_PREFIXES.CATALOG,
    INVENTORY_CACHE_PREFIXES.PROCUREMENT,
  );
  return saved;
};

/**
 * Calculates suggested replenishment orders based on available stock, reorder levels, and incoming purchase orders.
 */
exports.getSuggestedOrders = async () => {
  return await inventoryCache.get(`${INVENTORY_CACHE_PREFIXES.CATALOG}suggested-orders`, async () => {
    const [items, incomingOrders] = await Promise.all([
      // Mirrors utils/inventory-domain.js's isLowStock/deriveStockStatus
      // (available <= reorderLevel, both defaulting to 0 when absent) so this
      // Mongo-side query can't silently drift from the canonical JS check.
      Inventory.find({
        $expr: {
          $lte: [
            { $ifNull: ['$available', 0] },
            { $ifNull: ['$reorderLevel', 0] },
          ],
        },
      })
        .populate('supplierId', 'name')
        .sort({ available: 1 })
        .select('name description sku available reserved reorderLevel maxStockLevel unitCost unit status category itemClass subcategory brand manufacturerPartNumber compatibleModels supplierId'),
      PurchaseRequest.find({ status: { $in: [...ACTIVE_INCOMING_STATUSES, 'pending-approval'] } }).lean(),
    ]);
    const incomingByInventory = new Map();
    for (const order of incomingOrders) {
      for (const line of order.items || []) {
        if (!line.inventoryId) continue;
        const key = String(line.inventoryId);
        incomingByInventory.set(key, (incomingByInventory.get(key) || 0) + outstandingQuantity(line));
      }
    }
    return items.map((item) => ({
      ...item.toObject({ virtuals: true }),
      status: legacyStockStatus(item.available, item.reorderLevel),
      stockStatus: deriveStockStatus(item.available, item.reorderLevel),
      incomingQuantity: incomingByInventory.get(String(item._id)) || 0,
      suggestedQuantity: Math.max(0,
        suggestedOrderQuantity(item.available, item.maxStockLevel, item.reorderLevel)
        - (incomingByInventory.get(String(item._id)) || 0)),
    }));
  });
};
