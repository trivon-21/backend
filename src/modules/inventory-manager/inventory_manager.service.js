const Inventory = require('../../models/Inventory');
const Activity = require('../../models/Activity');
const Supplier = require('../../models/Supplier');
const Procurement = require('../../models/Procurement');
const DispatchOrder = require('../../models/DispatchOrder');
const WarehousePickRequest = require('../../models/WarehousePickRequest');
const AssetLoan = require('../../models/AssetLoan');
const PurchaseRequest = require('../../models/PurchaseRequest');
const ReceiptAuthorization = require('../../models/ReceiptAuthorization');
const LeftoverReturn = require('../../models/LeftoverReturn');
const RmaCase = require('../../models/RmaCase');
const QuarantineItem = require('../../models/QuarantineItem');
const ServiceTicket = require('../../models/ServiceTicket');
const InspectionTicket = require('../../models/InspectionTicket');
const Installation = require('../../models/Installation');
const User = require('../../models/User');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const {
  deriveStockStatus,
  legacyStockStatus,
  isLowStock,
  normalizeStringList,
  suggestedOrderQuantity,
  isValidClassification
} = require('../../utils/inventory-domain');
const {
  ACTIVE_INCOMING_STATUSES,
  canonicalPurchaseStatus,
  outstandingQuantity,
  fulfillmentStatus,
  NON_PO_REASONS,
} = require('../../utils/purchase-workflow');

const MASTER_DATA_FIELDS = [
  'name', 'itemClass', 'subcategory', 'brand', 'manufacturerPartNumber', 'type', 'unit',
  'reorderLevel', 'maxStockLevel', 'unitCost', 'location', 'binLocation', 'supplierId',
  'isSerialized', 'compatibleModels', 'systemType', 'refrigerants', 'capacityBtu',
  'voltage', 'phase', 'specsUrl'
];
const PROTECTED_STOCK_FIELDS = ['available', 'reserved', 'serialNumbers', 'status', 'category'];
const TECHNICIAN_ROLES = ['MAIN_TECH', 'SERVICE_TEAM', 'INSPECTION'];
const ORDER_UPDATE_FIELDS = ['status', 'courier', 'trackId', 'items', 'completedAt', 'lastMovedAt'];
const MATERIAL_REQUEST_UPDATE_FIELDS = ['status', 'items', 'serviceTeam', 'completedAt', 'lastMovedAt'];

function normalizeInventoryData(data, applyDefaults = true) {
  const normalized = { ...data };
  if (!normalized.itemClass && applyDefaults) normalized.itemClass = 'Unclassified';
  if (!normalized.subcategory && applyDefaults) normalized.subcategory = 'Unclassified';
  if (normalized.itemClass) normalized.category = normalized.itemClass;
  else delete normalized.category;
  if (normalized.supplierId === '') delete normalized.supplierId;
  for (const field of ['compatibleModels', 'refrigerants', 'serialNumbers']) {
    if (normalized[field] !== undefined) normalized[field] = normalizeStringList(normalized[field]);
  }
  return normalized;
}

function serviceError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function assertRole(user, roles) {
  if (!user || (!roles.includes(user.role) && user.role !== 'SUPER_ADMIN')) {
    throw serviceError('You are not allowed to perform this workflow action', 403, 'FORBIDDEN_WORKFLOW_ACTION');
  }
}

function actorName(user, fallback) {
  return user?.fullName || fallback;
}

function assertObjectId(value, message, code = 'INVALID_ID') {
  if (!mongoose.isValidObjectId(value)) throw serviceError(message, 400, code);
}

function pickFields(data, fields) {
  return Object.fromEntries(fields.filter((field) => data[field] !== undefined).map((field) => [field, data[field]]));
}

function validHttpUrl(value) {
  return !value || /^https?:\/\/\S+$/i.test(String(value));
}

function generateReference(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function orderLookup(id) {
  return mongoose.isValidObjectId(id) ? { _id: id } : { requestId: id };
}

function authorizationLookup(id) {
  return mongoose.isValidObjectId(id) ? { _id: id } : { authorizationNumber: id };
}

async function affectedWorkExists(type, id) {
  if (!mongoose.isValidObjectId(id)) return false;
  if (type === 'INSPECTION') return Boolean(await InspectionTicket.exists({ _id: id }));
  if (type === 'INSTALLATION') return Boolean(await Installation.exists({ _id: id }));
  if (['REPAIR', 'MAINTENANCE'].includes(type)) return Boolean(await ServiceTicket.exists({ _id: id }));
  if (type === 'TICKET') {
    const results = await Promise.all([
      ServiceTicket.exists({ _id: id }),
      InspectionTicket.exists({ _id: id }),
      Installation.exists({ _id: id }),
    ]);
    return results.some(Boolean);
  }
  return true;
}

function controllerSafeOrderFields(data) {
  return Object.fromEntries([
    'items', 'supplierId', 'supplierName', 'priority', 'notes', 'source',
  ].filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
}

function pickMasterData(data) {
  return Object.fromEntries(MASTER_DATA_FIELDS.filter((field) => data[field] !== undefined).map((field) => [field, data[field]]));
}

async function validateCatalogData(data, { partial = false } = {}) {
  const requiredFields = ['name', 'itemClass', 'subcategory', 'brand', 'type', 'unit', 'location'];
  if (!partial) {
    const missing = requiredFields.find((field) => !String(data[field] ?? '').trim());
    if (missing) throw serviceError(`${missing} is required`, 400, 'VALIDATION_ERROR');
  }
  if (data.itemClass !== undefined || data.subcategory !== undefined) {
    if (!isValidClassification(data.itemClass, data.subcategory) || data.itemClass === 'Unclassified') {
      throw serviceError('Select a valid product class and subcategory', 400, 'INVALID_CLASSIFICATION');
    }
  }
  for (const field of ['reorderLevel', 'maxStockLevel', 'unitCost', 'capacityBtu']) {
    if (data[field] !== undefined && data[field] !== null && Number(data[field]) < 0) {
      throw serviceError(`${field} cannot be negative`, 400, 'VALIDATION_ERROR');
    }
  }
  if (data.maxStockLevel !== undefined && data.reorderLevel !== undefined && Number(data.maxStockLevel) < Number(data.reorderLevel)) {
    throw serviceError('Maximum stock level must be greater than or equal to reorder level', 400, 'INVALID_STOCK_LEVELS');
  }
  if (data.specsUrl && !/^https?:\/\/\S+$/i.test(data.specsUrl)) {
    throw serviceError('Specifications URL must use http or https', 400, 'INVALID_URL');
  }
  if (data.supplierId) {
    assertObjectId(data.supplierId, 'Supplier reference is invalid', 'INVALID_SUPPLIER_ID');
    if (!(await Supplier.exists({ _id: data.supplierId }))) {
      throw serviceError('Supplier not found', 404, 'SUPPLIER_NOT_FOUND');
    }
  }
}

function rejectProtectedStockFields(data) {
  const field = PROTECTED_STOCK_FIELDS.find((name) => Object.prototype.hasOwnProperty.call(data, name));
  if (field) {
    throw serviceError(`${field} cannot be changed through the product catalog; use receiving or the relevant stock workflow`, 400, 'USE_STOCK_WORKFLOW');
  }
}

function synchronizeStatusForResponse(item) {
  if (item) item.status = legacyStockStatus(item.available, item.reorderLevel);
  return item;
}

/**
 * Retrieves aggregated dashboard data including inventory stats, recent activity, and logistics status.
 */
exports.getDashboardData = async (user) => {
  const [inventory, activities, orders, loans, materialRequests, orderRequests, authorizations] = await Promise.all([
  Inventory.find(),
  Activity.find({
    type: { $in: ['return', 'dispatch', 'request', 'grn', 'alert'] }
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
        { label: 'Reserved/Kitted', value: reservedRequestsCount }
      ]
    },
    dispatchQueue: {
      total: orders.filter(o => o.status === 'to-pack' || o.status === 'ready').length,
      subStats: [
        { label: 'To Pack', value: orders.filter(o => o.status === 'to-pack').length },
        { label: 'Ready for Pickup', value: orders.filter(o => o.status === 'ready').length }
      ]
    },
    assetHealth: {
      total: loans.length,
      subStats: [
        { label: 'Tools in Field', value: loans.length },
        { label: 'Overdue Returns', value: loans.filter(l => new Date(l.dueDate) < new Date()).length }
      ]
    },
    stockAlerts: {
      total: inventory.filter(isLowStock).length,
      subStats: [
        { label: 'Below Reorder', value: inventory.filter(i => deriveStockStatus(i.available, i.reorderLevel) === 'low-stock').length },
        { label: 'Out of Stock', value: inventory.filter(i => deriveStockStatus(i.available, i.reorderLevel) === 'out-of-stock').length }
      ]
    }
  };

  const reorderList = inventory
    .filter(isLowStock)
    .map(i => ({
      id: i._id,
      name: i.name,
      available: i.available,
      reserved: i.reserved,
      status: legacyStockStatus(i.available, i.reorderLevel),
      stockStatus: deriveStockStatus(i.available, i.reorderLevel)
    }));

  const normalAwaitingManager = orderRequests.filter((request) =>
    ['pending-manager', 'pending-approval'].includes(canonicalPurchaseStatus(request.status)),
  ).length;
  const normalAwaitingReceipt = orderRequests.filter((request) =>
    ['ordered', 'partially-received'].includes(canonicalPurchaseStatus(request.status))
    && (request.items || []).some((line) => outstandingQuantity(line) > 0),
  ).length;
  const normalAwaitingFinance = orderRequests.filter((request) =>
    canonicalPurchaseStatus(request.status) === 'pending-finance',
  ).length;
  const emergencyAwaitingManager = authorizations.filter((item) => item.status === 'pending').length;
  const emergencyAwaitingReceipt = authorizations.filter((item) =>
    ['approved', 'partially-received'].includes(item.status),
  ).length;
  const emergencyAwaitingFinance = authorizations.filter((item) =>
    Number(item.receivedQuantity || 0) > 0 && item.financeReviewStatus === 'pending',
  ).length;

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
      actionLabel: a.actionLabel
    })),
    reorderList,
    procurementWorkflow: {
      awaitingManager: normalAwaitingManager + emergencyAwaitingManager,
      awaitingReceipt: normalAwaitingReceipt + emergencyAwaitingReceipt,
      awaitingFinance: normalAwaitingFinance + emergencyAwaitingFinance,
    }
  };
};

/**
 * Fetches all inventory items sorted by name.
 */
exports.getInventoryList = async () => {
  const items = await Inventory.find().populate('supplierId', 'name').sort({ name: 1 });
  return items.map(synchronizeStatusForResponse);
};

/**
 * Retrieves a single inventory item by its ID.
 */
exports.getInventoryItem = async (id) => {
  if (!mongoose.isValidObjectId(id)) return null;
  const item = await Inventory.findById(id).populate('supplierId', 'name');
  return synchronizeStatusForResponse(item);
};

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
    && (existing.available > 0 || existing.serialNumbers.length > 0)) {
    throw serviceError('Serialized tracking cannot change while stock or asset tags exist', 409, 'SERIALIZATION_LOCKED');
  }
  update.status = legacyStockStatus(existing.available, update.reorderLevel ?? existing.reorderLevel);

  return await Inventory.findByIdAndUpdate(id, update, { new: true, runValidators: true })
    .populate('supplierId', 'name');
};

/**
 * Creates a new inventory item and calculates its initial stock status.
 * Automatically generates a GRN (Goods Received Note) and activity log if supplier info is provided.
 */
exports.createInventoryItem = async (data, user) => {
  rejectProtectedStockFields(data);
  if (!String(data.sku || '').trim()) throw serviceError('sku is required', 400, 'VALIDATION_ERROR');
  const normalizedData = normalizeInventoryData({ ...pickMasterData(data), sku: String(data.sku).trim() });
  await validateCatalogData(normalizedData);
  if (await Inventory.exists({ sku: normalizedData.sku })) {
    throw serviceError('SKU already exists', 409, 'DUPLICATE_SKU');
  }
  return await new Inventory({
    ...normalizedData,
    available: 0,
    reserved: 0,
    serialNumbers: [],
    status: legacyStockStatus(0, normalizedData.reorderLevel)
  }).save();
};

exports.createReceiptAuthorization = async (data, user) => {
  assertRole(user, ['INVENTORY']);
  const quantity = Number(data.authorizedQuantity);
  const unitCost = Number(data.unitCost || 0);
  if (!Number.isInteger(quantity) || quantity <= 0 || unitCost < 0) {
    throw serviceError('Authorized quantity must be a positive whole number and cost cannot be negative', 400, 'INVALID_AUTHORIZATION_VALUE');
  }
  if (!NON_PO_REASONS.includes(data.nonPoReason)) {
    throw serviceError('Select a valid Non-PO reason', 400, 'INVALID_NON_PO_REASON');
  }
  if (!String(data.explanation || '').trim() || !String(data.sourceDocumentNumber || '').trim()) {
    throw serviceError('Explanation and source document number are required', 400, 'AUTHORIZATION_DETAILS_REQUIRED');
  }
  if (!validHttpUrl(data.supportingDocumentUrl)) {
    throw serviceError('Supporting document URL must use http or https', 400, 'INVALID_URL');
  }
  const affectedWorkType = data.affectedWorkType || 'NONE';
  if (affectedWorkType !== 'NONE' && !data.affectedWorkId && !String(data.affectedWorkReference || '').trim()) {
    throw serviceError('An affected job ID or reference is required', 400, 'AFFECTED_WORK_REQUIRED');
  }
  if (!['NONE', 'OTHER'].includes(affectedWorkType)
    && !(await affectedWorkExists(affectedWorkType, data.affectedWorkId))) {
    throw serviceError('Affected work record not found; use its shared database ID', 404, 'AFFECTED_WORK_NOT_FOUND');
  }
  if (!mongoose.isValidObjectId(data.supplierId)) {
    throw serviceError('Supplier not found', 404, 'SUPPLIER_NOT_FOUND');
  }
  const supplier = await Supplier.findById(data.supplierId);
  if (!supplier) throw serviceError('Supplier not found', 404, 'SUPPLIER_NOT_FOUND');

  let inventoryId;
  let newItemSnapshot;
  if (data.inventoryId) {
    assertObjectId(data.inventoryId, 'Inventory item reference is invalid', 'INVALID_ITEM_ID');
    const item = await Inventory.findById(data.inventoryId);
    if (!item) throw serviceError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
    inventoryId = item._id;
  } else {
    newItemSnapshot = normalizeInventoryData({ ...(data.item || {}), supplierId: supplier._id });
    if (!newItemSnapshot.name || !newItemSnapshot.sku || !newItemSnapshot.brand) {
      throw serviceError('Name, SKU and brand are required for a new item', 400, 'INVALID_ITEM');
    }
    await validateCatalogData(newItemSnapshot);
    if (await Inventory.exists({ sku: newItemSnapshot.sku })) {
      throw serviceError('SKU already exists; select the catalog item', 409, 'DUPLICATE_SKU');
    }
  }

  try {
    const authorization = await ReceiptAuthorization.create({
      authorizationNumber: generateReference('NPO'),
      nonPoReason: data.nonPoReason,
      explanation: String(data.explanation).trim(),
      inventoryId,
      newItemSnapshot,
      supplierId: supplier._id,
      supplierName: supplier.name,
      authorizedQuantity: quantity,
      unitCost,
      estimatedTotal: quantity * unitCost,
      affectedWorkType,
      affectedWorkId: data.affectedWorkId || '',
      affectedWorkReference: data.affectedWorkReference || '',
      sourceDocumentNumber: String(data.sourceDocumentNumber).trim(),
      supportingDocumentUrl: data.supportingDocumentUrl || '',
      requestedById: user._id,
      requestedByName: actorName(user, 'Inventory Manager'),
      financeReviewStatus: unitCost === 0 && ['WARRANTY_REPLACEMENT', 'SUPPLIER_REPLACEMENT'].includes(data.nonPoReason)
        ? 'not-required' : 'pending',
    });
    await Activity.create({
      type: 'request', title: 'Non-PO Authorization Requested',
      description: `${authorization.authorizationNumber} submitted to Manager`, actionLabel: 'View Authorization',
    });
    return authorization.populate(['inventoryId', { path: 'supplierId', select: 'name' }]);
  } catch (error) {
    if (error.code === 11000) {
      throw serviceError('This supplier and source document already have an authorization', 409, 'DUPLICATE_SOURCE_DOCUMENT');
    }
    throw error;
  }
};

exports.getReceiptAuthorizations = async (filters = {}, user) => {
  assertRole(user, ['INVENTORY']);
  const query = {};
  if (filters.status) query.status = filters.status;
  return ReceiptAuthorization.find(query)
    .populate('inventoryId', 'name sku available reorderLevel itemClass subcategory brand isSerialized')
    .populate('supplierId', 'name')
    .sort({ createdAt: -1 });
};

/** Posts an issued PO line or approved Non-PO authorization through one transaction. */
exports.receiveInventory = async (data, user) => {
  assertRole(user, ['INVENTORY']);
  const mode = data.receiptMode;
  if (!['PO', 'NON_PO'].includes(mode)) {
    throw serviceError('receiptMode must be PO or NON_PO; legacy direct receipts are no longer accepted', 400, 'RECEIPT_MODE_REQUIRED');
  }
  const quantity = Number(data.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw serviceError('Receipt quantity must be a positive whole number', 400, 'INVALID_QUANTITY');
  }
  const sourceDocumentNumber = String(data.sourceDocumentNumber || '').trim();
  if (!sourceDocumentNumber) {
    throw serviceError('Source document number is required', 400, 'SOURCE_DOCUMENT_REQUIRED');
  }
  const receiptEventId = String(data.receiptEventId || '').trim();
  if (!receiptEventId) {
    throw serviceError('A receipt event ID is required for safe retry protection', 400, 'RECEIPT_EVENT_REQUIRED');
  }
  if (!validHttpUrl(data.supportingDocumentUrl)) {
    throw serviceError('Supporting document URL must use http or https', 400, 'INVALID_URL');
  }
  const submittedSerials = Array.isArray(data.serialNumbers) ? data.serialNumbers : [];
  const serialNumbers = normalizeStringList(submittedSerials);
  if (serialNumbers.length !== submittedSerials.length) {
    throw serviceError('Serial numbers must be unique within the receipt', 409, 'DUPLICATE_SERIAL');
  }

  try {
    const result = await mongoose.connection.transaction(async (session) => {
      let order;
      let orderLine;
      let authorization;
      let supplier;
      let item;
      let receiptUnitCost;
      let sourceDocumentKey;

      if (mode === 'PO') {
        if (!data.orderRequestId || !data.orderLineId) {
          throw serviceError('An issued PO and order line are required', 400, 'PO_REFERENCE_REQUIRED');
        }
        order = await PurchaseRequest.findOne(orderLookup(data.orderRequestId)).session(session);
        if (!order) throw serviceError('Purchase order not found', 404, 'ORDER_NOT_FOUND');
        if (!['ordered', 'partially-received'].includes(canonicalPurchaseStatus(order.status))) {
          throw serviceError('Only issued purchase orders can be received', 409, 'PO_NOT_ISSUED');
        }
        orderLine = order.items.find(line => line.lineId === data.orderLineId);
        if (!orderLine) throw serviceError('Purchase order line not found', 404, 'ORDER_LINE_NOT_FOUND');
        if (quantity > outstandingQuantity(orderLine)) {
          throw serviceError('Receipt exceeds the outstanding PO quantity', 409, 'RECEIPT_EXCEEDS_ORDER');
        }
        if (!orderLine.inventoryId) {
          throw serviceError('The PO line is not linked to a catalog item', 409, 'ORDER_ITEM_NOT_LINKED');
        }
        item = await Inventory.findById(orderLine.inventoryId).session(session);
        if (!item) throw serviceError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
        supplier = order.supplierId
          ? await Supplier.findById(order.supplierId).session(session)
          : await Supplier.findOne({ name: order.supplierName }).session(session);
        if (!supplier) throw serviceError('Supplier not found', 404, 'SUPPLIER_NOT_FOUND');
        receiptUnitCost = Number(orderLine.unitCost || 0);
        if (data.unitCost !== undefined && Number(data.unitCost) !== receiptUnitCost) {
          throw serviceError('PO cost cannot be changed during receiving', 409, 'APPROVED_DETAILS_CHANGED');
        }
        sourceDocumentKey = `${supplier._id}:${sourceDocumentNumber}:PO:${orderLine.lineId}`;
      } else {
        if (!data.receiptAuthorizationId) {
          throw serviceError('An approved Non-PO authorization is required', 400, 'AUTHORIZATION_REQUIRED');
        }
        authorization = await ReceiptAuthorization.findOne(authorizationLookup(data.receiptAuthorizationId)).session(session);
        if (!authorization) throw serviceError('Receipt authorization not found', 404, 'AUTHORIZATION_NOT_FOUND');
        if (!['approved', 'partially-received'].includes(authorization.status)) {
          throw serviceError('Pending, rejected or completed authorizations cannot post stock', 409, 'AUTHORIZATION_NOT_RECEIVABLE');
        }
        const remaining = authorization.authorizedQuantity - authorization.receivedQuantity;
        if (quantity > remaining) {
          throw serviceError('Receipt exceeds the authorized quantity', 409, 'RECEIPT_EXCEEDS_AUTHORIZATION');
        }
        supplier = await Supplier.findById(authorization.supplierId).session(session);
        if (!supplier) throw serviceError('Supplier not found', 404, 'SUPPLIER_NOT_FOUND');
        receiptUnitCost = Number(authorization.unitCost || 0);
        if (data.supplierId && String(data.supplierId) !== String(supplier._id)
          || data.unitCost !== undefined && Number(data.unitCost) !== receiptUnitCost
          || data.inventoryId && authorization.inventoryId && String(data.inventoryId) !== String(authorization.inventoryId)) {
          throw serviceError('Approved supplier, item and cost cannot be changed during receiving', 409, 'APPROVED_DETAILS_CHANGED');
        }
        if (authorization.inventoryId) {
          item = await Inventory.findById(authorization.inventoryId).session(session);
          if (!item) throw serviceError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
        } else {
          const itemData = normalizeInventoryData({
            ...authorization.newItemSnapshot,
            available: 0,
            reserved: 0,
            supplierId: supplier._id,
            serialNumbers: [],
          });
          item = await new Inventory(itemData).save({ session });
          authorization.inventoryId = item._id;
        }
        sourceDocumentKey = `${supplier._id}:${sourceDocumentNumber}:NON_PO:${authorization._id}`;
      }

      if (item.isSerialized && serialNumbers.length !== quantity) {
        throw serviceError('Serialized items require one serial number per received unit', 400, 'SERIAL_COUNT_MISMATCH');
      }
      if (!item.isSerialized && serialNumbers.length) {
        throw serviceError('Serial numbers are only allowed for serialized items', 400, 'UNEXPECTED_SERIALS');
      }
      if (serialNumbers.length && await Inventory.exists({ serialNumbers: { $in: serialNumbers } }).session(session)) {
        throw serviceError('One or more serial numbers already exist in inventory', 409, 'DUPLICATE_SERIAL');
      }
      if (await Procurement.exists({ receiptEventId }).session(session)) {
        throw serviceError('This receipt submission has already been posted', 409, 'DUPLICATE_RECEIPT_EVENT');
      }

      item.available += quantity;
      item.serialNumbers.push(...serialNumbers);
      item.supplierId = supplier._id;
      if (data.location) item.location = data.location;
      if (data.binLocation !== undefined) item.binLocation = data.binLocation;
      item.unitCost = receiptUnitCost;
      item.status = legacyStockStatus(item.available, item.reorderLevel);
      await item.save({ session });

      if (order) {
        orderLine.receivedQuantity += quantity;
        order.status = fulfillmentStatus(order.items);
        order.statusVersion += 1;
        await order.save({ session });
      }
      if (authorization) {
        authorization.receivedQuantity += quantity;
        authorization.status = authorization.receivedQuantity >= authorization.authorizedQuantity
          ? 'completed' : 'partially-received';
        authorization.statusVersion += 1;
        await authorization.save({ session });
      }

      const [procurement] = await Procurement.create([{
        inventoryId: item._id,
        receiptMode: mode,
        invoiceNumber: data.invoiceNumber || '',
        poNumber: order?.poNumber || '',
        orderRequestId: order?._id,
        orderLineId: orderLine?.lineId || '',
        receiptAuthorizationId: authorization?._id,
        nonPoReason: authorization?.nonPoReason || '',
        sourceDocumentNumber,
        sourceDocumentKey,
        receiptEventId,
        supportingDocumentUrl: data.supportingDocumentUrl || authorization?.supportingDocumentUrl || '',
        affectedWorkReference: authorization?.affectedWorkReference || '',
        supplierId: supplier._id,
        supplierName: supplier.name,
        itemName: item.name,
        sku: item.sku,
        itemClass: item.itemClass,
        subcategory: item.subcategory,
        brand: item.brand,
        quantity,
        unit: item.unit,
        unitCost: receiptUnitCost,
        totalCost: quantity * receiptUnitCost,
        binLocation: item.binLocation || '',
        receivedBy: actorName(user, 'Inventory Manager'),
        receivedDate: data.receivedDate || new Date(),
        condition: data.condition || 'Good',
      }], { session });

      await Activity.create([{
        type: 'grn', title: 'Goods Received',
        description: `${mode} receipt: ${quantity} ${item.unit} of ${item.name} from ${supplier.name}`,
        actionLabel: 'View GRN',
      }], { session });
      return { itemId: item._id, procurementId: procurement._id };
    });

    return {
      item: await Inventory.findById(result.itemId).populate('supplierId', 'name'),
      procurement: await Procurement.findById(result.procurementId)
        .populate('supplierId', 'name')
        .populate('receiptAuthorizationId'),
    };
  } catch (error) {
    if (error.code === 11000) {
      const field = error.keyPattern?.sku ? 'SKU' : error.keyPattern?.serialNumbers ? 'serial number' : 'source document';
      throw serviceError(`${field} already exists`, 409, `DUPLICATE_${field.replace(' ', '_').toUpperCase()}`);
    }
    if (/Transaction numbers are only allowed|replica set|transaction support/i.test(error.message || '')) {
      throw serviceError('A transaction-capable MongoDB deployment is required to post receipts', 503, 'TRANSACTIONS_REQUIRED');
    }
    throw error;
  }
};

/**
 * Fetches the most recent procurement records.
 */
exports.getRecentProcurements = async () => {
  return await Procurement.find()
    .populate('inventoryId', 'name sku')
    .populate('supplierId', 'name')
    .populate('orderRequestId', 'requestId poNumber status')
    .populate('receiptAuthorizationId', 'authorizationNumber status financeReviewStatus nonPoReason')
    .sort({ timestamp: -1 })
    .limit(100);
};

/**
 * Retrieves a list of all registered suppliers.
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
  return await newSupplier.save();
};

/**
 * Retrieves all orders sorted by creation date.
 */
exports.getOrders = async () => {
  return await DispatchOrder.find().sort({ createdAt: -1 });
};

/**
 * Updates an order's details and manages status-related timestamps.
 */
exports.updateOrder = async (id, data) => {
  const safe = pickFields(data, ORDER_UPDATE_FIELDS);
  const update = safe.lastMovedAt === null
    ? { $unset: { lastMovedAt: 1, completedAt: 1 }, $set: pickFields(safe, ORDER_UPDATE_FIELDS.filter((field) => !['lastMovedAt', 'completedAt'].includes(field))) }
    : { $set: safe };
  return DispatchOrder.findOneAndUpdate({ orderId: id }, update, { new: true, runValidators: true });
};

/**
 * Fetches all material requests sorted by creation date.
 */
exports.getMaterialRequests = async () => {
  return await WarehousePickRequest.find().sort({ createdAt: -1 });
};

/**
 * Updates a material request and handles state transition resets.
 */
exports.updateMaterialRequest = async (id, data) => {
  const safe = pickFields(data, MATERIAL_REQUEST_UPDATE_FIELDS);
  const update = safe.lastMovedAt === null
    ? { $unset: { lastMovedAt: 1, completedAt: 1 }, $set: pickFields(safe, MATERIAL_REQUEST_UPDATE_FIELDS.filter((field) => !['lastMovedAt', 'completedAt'].includes(field))) }
    : { $set: safe };
  return WarehousePickRequest.findOneAndUpdate({ requestId: id }, update, { new: true, runValidators: true });
};

/**
 * Retrieves technician members from the configured shared database.
 */
exports.getTechnicians = async () => {
  const technicians = await User.find({ role: { $in: TECHNICIAN_ROLES } })
    .select('fullName role')
    .sort({ fullName: 1 })
    .lean();
  return technicians.map((technician) => ({
    _id: technician._id,
    name: technician.fullName,
    fullName: technician.fullName,
    role: technician.role,
  }));
};

/**
 * Fetches all active asset loans.
 */
exports.getAssetLoans = async () => {
  return await AssetLoan.find({ status: { $ne: 'returned' } }).sort({ checkedOutAt: -1 });
};

/**
 * Returns serialized HVAC tools with asset tags that are not currently on loan.
 */
exports.getAvailableTools = async () => {
  const [tools, activeLoans] = await Promise.all([
    Inventory.find({ itemClass: 'Tools and Test Equipment', isSerialized: true })
      .select('name sku itemClass subcategory brand serialNumbers location binLocation'),
    AssetLoan.find({ status: { $ne: 'returned' } }).select('assetTag')
  ]);
  const loanedTags = new Set(activeLoans.map((loan) => loan.assetTag));
  return tools
    .map((tool) => ({
      ...tool.toObject({ virtuals: true }),
      availableSerialNumbers: tool.serialNumbers.filter((serial) => !loanedTags.has(serial))
    }))
    .filter((tool) => tool.availableSerialNumbers.length > 0);
};

/**
 * Records a new tool checkout and logs the activity.
 */
exports.checkOutTool = async (data, user) => {
  assertRole(user, ['INVENTORY']);
  assertObjectId(data.toolId, 'Tool reference is invalid', 'INVALID_TOOL_ID');
  assertObjectId(data.technicianId, 'Technician reference is invalid', 'INVALID_TECHNICIAN_ID');
  if (!String(data.assetTag || '').trim()) {
    throw serviceError('Select an asset tag', 400, 'ASSET_TAG_REQUIRED');
  }
  const dueDate = new Date(data.dueDate);
  if (Number.isNaN(dueDate.getTime()) || dueDate <= new Date()) {
    throw serviceError('Tool due date must be a valid future date', 400, 'INVALID_DUE_DATE');
  }
  const technician = await User.findOne({ _id: data.technicianId, role: { $in: TECHNICIAN_ROLES } });
  if (!technician) throw serviceError('Technician not found or role is not eligible for tool lending', 404, 'TECHNICIAN_NOT_FOUND');
  const tool = await Inventory.findOne({
    _id: data.toolId,
    itemClass: 'Tools and Test Equipment',
    isSerialized: true,
    serialNumbers: data.assetTag
  });
  if (!tool) throw serviceError('Serialized tool or asset tag not found', 404, 'TOOL_NOT_FOUND');
  const assetTag = String(data.assetTag).trim();
  const existingLoan = await AssetLoan.findOne({ assetTag });
  if (existingLoan && existingLoan.status !== 'returned') {
    throw serviceError('This asset tag is already checked out', 409, 'ASSET_ALREADY_LOANED');
  }

  const newLoan = existingLoan || new AssetLoan({ assetTag });
  Object.assign(newLoan, {
    toolId: tool._id,
    toolName: tool.name,
    technicianId: String(technician._id),
    technicianUserId: technician._id,
    technicianName: technician.fullName,
    checkedOutAt: new Date(),
    dueDate,
    status: 'on-loan',
    returnedAt: undefined,
    condition: 'good',
  });
  let savedLoan;
  try {
    savedLoan = await newLoan.save();
  } catch (error) {
    if (error.code === 11000) throw serviceError('This asset tag is already checked out', 409, 'ASSET_ALREADY_LOANED');
    throw error;
  }

  const activity = new Activity({
    type: 'request',
    title: 'Tool Checked Out',
    description: `${technician.fullName} checked out ${tool.name} (${data.assetTag})`,
    actionLabel: 'View Asset'
  });
  await activity.save();

  return savedLoan;
};

/**
 * Processes a tool return, archiving the loan and logging the return event.
 */
exports.returnTool = async (loanId, user, input = {}) => {
  assertRole(user, ['INVENTORY']);
  assertObjectId(loanId, 'Loan reference is invalid', 'INVALID_LOAN_ID');
  const loan = await AssetLoan.findById(loanId);
  if (!loan) throw serviceError('Loan not found', 404, 'LOAN_NOT_FOUND');
  if (loan.status === 'returned') throw serviceError('This loan has already been returned', 409, 'ASSET_ALREADY_RETURNED');
  const condition = input.condition || 'good';
  if (!['good', 'damaged', 'incomplete'].includes(condition)) {
    throw serviceError('Return condition must be good, damaged, or incomplete', 400, 'INVALID_RETURN_CONDITION');
  }
  loan.status = 'returned';
  loan.returnedAt = new Date();
  loan.condition = condition;
  await loan.save();

  const activity = new Activity({
    type: 'return',
    title: 'Tool Returned',
    description: `${loan.technicianName} returned ${loan.toolName} (${loan.assetTag})`,
    actionLabel: 'View Log'
  });
  await activity.save();

  return loan;
};

/**
 * Retrieves all historical asset return logs.
 */
exports.getAssetReturnLogs = async () => {
  return await AssetLoan.find({ status: 'returned' }).sort({ returnedAt: -1 });
};

// ── Order Creation Methods ──

/**
 * Fetches all purchase order requests.
 */
exports.getOrderRequests = async (user) => {
  assertRole(user, ['INVENTORY']);
  return await PurchaseRequest.find().populate('items.supplierId', 'name').sort({ createdAt: -1 });
};

/**
 * Creates a new purchase order request with auto-generated ID and total estimates.
 */
exports.createOrderRequest = async (data, user) => {
  assertRole(user, ['INVENTORY']);
  const requestId = generateReference('REQ');
  const safe = controllerSafeOrderFields(data);
  if (!Array.isArray(safe.items) || !safe.items.length) {
    throw serviceError('At least one purchase item is required', 400, 'INVALID_ORDER_ITEMS');
  }
  const items = safe.items.map(item => {
    const quantity = Number(item.quantity);
    const unitCost = Number(item.unitCost || 0);
    if (!Number.isInteger(quantity) || quantity <= 0 || unitCost < 0) {
      throw serviceError('Order quantities must be positive whole numbers and costs cannot be negative', 400, 'INVALID_ORDER_ITEM');
    }
    return {
      ...item,
      lineId: item.lineId || randomUUID(),
      quantity,
      orderedQuantity: quantity,
      receivedQuantity: 0,
      unitCost,
      estimatedTotal: quantity * unitCost,
    };
  });
  if (items.some((item) => !item.inventoryId)) {
    throw serviceError('Every purchase line must reference a catalog item; create the product first', 400, 'ORDER_ITEM_NOT_LINKED');
  }
  const totalEstimate = items.reduce((sum, item) => sum + item.estimatedTotal, 0);

  const supplierIds = [...new Set(items.map(item => String(item.supplierId || safe.supplierId || '')).filter(Boolean))];
  if (supplierIds.length > 1) {
    throw serviceError('A purchase request can contain items for only one supplier', 400, 'MIXED_SUPPLIERS');
  }
  const supplierId = safe.supplierId || supplierIds[0];
  if (safe.supplierId && supplierIds.some(id => id !== String(safe.supplierId))) {
    throw serviceError('Order lines must use the request supplier', 400, 'MIXED_SUPPLIERS');
  }
  let supplier;
  if (supplierId) {
    assertObjectId(supplierId, 'Supplier reference is invalid', 'INVALID_SUPPLIER_ID');
    supplier = await Supplier.findById(supplierId);
    if (!supplier) throw serviceError('Supplier not found', 404, 'SUPPLIER_NOT_FOUND');
  }
  const inventoryIds = [...new Set(items.map((item) => String(item.inventoryId || '')).filter(Boolean))];
  if (inventoryIds.some((id) => !mongoose.isValidObjectId(id))) {
    throw serviceError('One or more inventory references are invalid', 400, 'INVALID_ITEM_ID');
  }
  if (inventoryIds.length && await Inventory.countDocuments({ _id: { $in: inventoryIds } }) !== inventoryIds.length) {
    throw serviceError('One or more inventory items were not found', 404, 'ITEM_NOT_FOUND');
  }
  if (!String(safe.supplierName || '').trim()) {
    throw serviceError('Supplier is required', 400, 'SUPPLIER_REQUIRED');
  }

  const newRequest = new PurchaseRequest({
    requestId,
    items,
    supplierId,
    supplierName: supplier?.name || safe.supplierName,
    totalEstimate,
    status: 'draft',
    requestedById: user._id,
    requestedBy: actorName(user, 'Inventory Manager'),
    priority: safe.priority || 'normal',
    notes: safe.notes || '',
    source: safe.source || 'manual',
  });

  const saved = await newRequest.save();

  const activity = new Activity({
    type: 'request',
    title: 'Order Request Created',
    description: `Draft purchase request ${requestId} created for ${safe.supplierName} (${items.length} items)`,
    actionLabel: 'View Order'
  });
  await activity.save();

  return saved;
};

/**
 * Updates an existing purchase order request.
 */
exports.updateOrderRequest = async (id, data, user) => {
  assertRole(user, ['INVENTORY']);
  const request = await PurchaseRequest.findOne({ requestId: id });
  if (!request) throw serviceError('Order request not found', 404, 'ORDER_NOT_FOUND');
  if (!['draft', 'rejected'].includes(canonicalPurchaseStatus(request.status))) {
    throw serviceError('Only draft or rejected requests can be edited', 409, 'ORDER_LOCKED');
  }
  if (String(request.requestedById || '') !== String(user._id)) {
    throw serviceError('Only the requester can edit this purchase request', 403, 'NOT_REQUEST_OWNER');
  }
  const safe = controllerSafeOrderFields(data);
  if (safe.items) {
    safe.items = safe.items.map(item => {
      const quantity = Number(item.quantity);
      const unitCost = Number(item.unitCost || 0);
      if (!Number.isInteger(quantity) || quantity <= 0 || unitCost < 0) {
        throw serviceError('Order quantities must be positive whole numbers and costs cannot be negative', 400, 'INVALID_ORDER_ITEM');
      }
      return {
        ...item,
        lineId: item.lineId || randomUUID(),
        quantity,
        orderedQuantity: quantity,
        receivedQuantity: 0,
        unitCost,
        estimatedTotal: quantity * unitCost,
      };
    });
    if (safe.items.some((item) => !item.inventoryId)) {
      throw serviceError('Every purchase line must reference a catalog item; create the product first', 400, 'ORDER_ITEM_NOT_LINKED');
    }
    const proposedInventoryIds = [...new Set(safe.items.map((item) => String(item.inventoryId || '')).filter(Boolean))];
    if (proposedInventoryIds.some((itemId) => !mongoose.isValidObjectId(itemId))) {
      throw serviceError('One or more inventory references are invalid', 400, 'INVALID_ITEM_ID');
    }
    request.items = safe.items;
    request.totalEstimate = safe.items.reduce((sum, item) => sum + item.estimatedTotal, 0);
  }
  if (safe.supplierId !== undefined && safe.supplierId !== null && safe.supplierId !== '') {
    assertObjectId(safe.supplierId, 'Supplier reference is invalid', 'INVALID_SUPPLIER_ID');
  }
  for (const field of ['supplierId', 'supplierName', 'priority', 'notes', 'source']) {
    if (safe[field] !== undefined) request[field] = safe[field];
  }
  if (request.supplierId) {
    assertObjectId(request.supplierId, 'Supplier reference is invalid', 'INVALID_SUPPLIER_ID');
    const supplier = await Supplier.findById(request.supplierId);
    if (!supplier) throw serviceError('Supplier not found', 404, 'SUPPLIER_NOT_FOUND');
    request.supplierName = supplier.name;
  }
  const requestSupplier = String(request.supplierId || '');
  if (requestSupplier && request.items.some(item => item.supplierId && String(item.supplierId) !== requestSupplier)) {
    throw serviceError('Order lines must use the request supplier', 400, 'MIXED_SUPPLIERS');
  }
  const inventoryIds = [...new Set(request.items.map((item) => String(item.inventoryId || '')).filter(Boolean))];
  if (inventoryIds.some((itemId) => !mongoose.isValidObjectId(itemId))) {
    throw serviceError('One or more inventory references are invalid', 400, 'INVALID_ITEM_ID');
  }
  if (inventoryIds.length && await Inventory.countDocuments({ _id: { $in: inventoryIds } }) !== inventoryIds.length) {
    throw serviceError('One or more inventory items were not found', 404, 'ITEM_NOT_FOUND');
  }
  request.status = 'draft';
  request.operationalApproval = { status: 'pending' };
  request.financialApproval = { status: 'pending' };
  request.rejectionReason = '';
  request.rejectedAt = undefined;
  request.approvedBy = '';
  request.approvedAt = undefined;
  request.statusVersion += 1;
  return request.save();
};

exports.submitOrderRequest = async (id, user) => {
  assertRole(user, ['INVENTORY']);
  const request = await PurchaseRequest.findOne(orderLookup(id));
  if (!request) throw serviceError('Order request not found', 404, 'ORDER_NOT_FOUND');
  if (String(request.requestedById || '') !== String(user._id)) {
    throw serviceError('Only the requester can submit this purchase request', 403, 'NOT_REQUEST_OWNER');
  }
  if (!['draft', 'rejected'].includes(canonicalPurchaseStatus(request.status))) {
    throw serviceError('Only draft or rejected requests can be submitted', 409, 'INVALID_ORDER_TRANSITION');
  }
  if (!request.items.length || !request.supplierName) {
    throw serviceError('Supplier and at least one item are required', 400, 'INVALID_ORDER');
  }
  request.status = 'pending-manager';
  request.operationalApproval = { status: 'pending' };
  request.financialApproval = { status: 'pending' };
  request.rejectionReason = '';
  request.rejectedAt = undefined;
  request.approvedBy = '';
  request.approvedAt = undefined;
  request.statusVersion += 1;
  request.decisionHistory.push({
    stage: 'manager', decision: 'submitted', actorId: user._id,
    actorName: actorName(user, 'Inventory Manager'), comment: request.notes || '',
  });
  await request.save();
  await Activity.create({
    type: 'request', title: 'Purchase Request Submitted',
    description: `${request.requestId} submitted to Manager for operational approval`, actionLabel: 'View Request',
  });
  return request;
};

exports.issuePurchaseOrder = async (id, user) => {
  assertRole(user, ['INVENTORY']);
  const request = await PurchaseRequest.findOne(orderLookup(id));
  if (!request) throw serviceError('Order request not found', 404, 'ORDER_NOT_FOUND');
  if (canonicalPurchaseStatus(request.status) !== 'approved') {
    throw serviceError('Only fully approved requests can be issued as purchase orders', 409, 'ORDER_NOT_APPROVED');
  }
  request.poNumber = request.poNumber || generateReference('PO');
  request.orderedAt = new Date();
  request.status = 'ordered';
  for (const item of request.items) item.orderedQuantity = item.quantity;
  request.statusVersion += 1;
  request.decisionHistory.push({
    stage: 'fulfillment', decision: 'po-issued', actorId: user._id,
    actorName: actorName(user, 'Inventory Manager'), comment: request.poNumber,
  });
  await request.save();
  await Activity.create({
    type: 'request', title: 'Purchase Order Issued',
    description: `${request.poNumber} issued from ${request.requestId}`, actionLabel: 'Receive Stock',
  });
  return request;
};

exports.retiredInventoryApproval = () => {
  throw serviceError('Inventory approval was retired; submit the request to Manager Approvals', 410, 'APPROVAL_MOVED_TO_MANAGER');
};

/**
 * Retrieves items that require restocking based on their low-stock status.
 */
exports.getSuggestedOrders = async () => {
  const [items, incomingOrders] = await Promise.all([Inventory.find({
    $expr: {
      $lte: [
        { $ifNull: ['$available', 0] },
        { $ifNull: ['$reorderLevel', 10] }
      ]
    }
  })
    .populate('supplierId', 'name')
    .sort({ available: 1 })
    .select('name sku available reserved reorderLevel maxStockLevel unitCost unit status category itemClass subcategory brand manufacturerPartNumber compatibleModels supplierId'),
  PurchaseRequest.find({ status: { $in: [...ACTIVE_INCOMING_STATUSES, 'pending-approval'] } }).lean()]);
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
      - (incomingByInventory.get(String(item._id)) || 0))
  }));
};

/**
 * Retrieves the global activity log for inventory and logistics events.
 */
exports.getActivityLog = async () => {
  return await Activity.find({ 
    type: { $in: ['return', 'dispatch', 'request', 'grn', 'alert'] } 
  }).sort({ timestamp: -1 });
};

// ── Returns & RMA Methods ──

/**
 * Generates a unique ID with the given prefix and current timestamp.
 */
function generateId(prefix) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${prefix}-${year}${month}${day}-${hours}${minutes}${seconds}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

/**
 * Fetches all leftover returns sorted by most recent first.
 */
exports.getLeftoverReturns = async () => {
  return await LeftoverReturn.find().sort({ createdAt: -1 });
};

/**
 * Creates a new leftover return record.
 * - If condition is 'good': restores quantity to inventory stock.
 * - If condition is 'damaged' or 'scrap': creates a quarantine item.
 * Logs an activity for the return.
 */
exports.createLeftoverReturn = async (data, user) => {
  assertRole(user, ['INVENTORY']);
  const returnId = generateId('LR');
  const returnedBy = user?.fullName || 'Inventory Manager';
  const quantityReturned = Number(data.quantityReturned);
  if (!Number.isInteger(quantityReturned) || quantityReturned <= 0) {
    throw serviceError('Returned quantity must be a positive whole number', 400, 'INVALID_RETURN_QUANTITY');
  }
  if (!String(data.jobId || '').trim() || !String(data.itemName || '').trim()) {
    throw serviceError('Job reference and item name are required', 400, 'RETURN_DETAILS_REQUIRED');
  }
  if (!['good', 'damaged', 'scrap'].includes(data.condition)) {
    throw serviceError('Return condition must be good, damaged or scrap', 400, 'INVALID_RETURN_CONDITION');
  }
  let inventoryItem;
  if (data.itemId) {
    assertObjectId(data.itemId, 'Inventory item reference is invalid', 'INVALID_ITEM_ID');
    inventoryItem = await Inventory.findById(data.itemId);
    if (!inventoryItem) throw serviceError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
  }
  if (data.condition === 'good' && !inventoryItem) {
    throw serviceError('Good returns require a catalog inventory item', 400, 'ITEM_REQUIRED_FOR_RESTOCK');
  }

  const leftoverReturn = new LeftoverReturn({
    returnId,
    jobId: data.jobId,
    itemId: data.itemId || null,
    itemName: data.itemName,
    itemSku: data.itemSku || '',
    quantityReturned,
    condition: data.condition,
    returnedBy,
    notes: data.notes || '',
    restoredToStock: false,
    movedToQuarantine: false,
  });

  // Business logic: update stock or quarantine based on condition
  if (data.condition === 'good') {
    // Restore to inventory
    inventoryItem.available = Number(inventoryItem.available || 0) + quantityReturned;
    inventoryItem.status = legacyStockStatus(inventoryItem.available, inventoryItem.reorderLevel);
    await inventoryItem.save();
    leftoverReturn.restoredToStock = true;
  } else {
    // Damaged or scrap → move to quarantine
    const quarantineId = generateId('QZ');
    const quarantineItem = new QuarantineItem({
      quarantineId,
      itemName: data.itemName,
      quantity: quantityReturned,
      unit: data.unit || 'units',
      reason: data.condition === 'scrap'
        ? `Scrap from job ${data.jobId}: ${data.notes || 'No details'}`
        : `Damaged from job ${data.jobId}: ${data.notes || 'No details'}`,
      location: data.location || '',
      source: 'leftover-return',
      sourceRefId: returnId,
    });
    await quarantineItem.save();
    leftoverReturn.movedToQuarantine = true;
  }

  const saved = await leftoverReturn.save();

  // Log activity
  const activity = new Activity({
    type: 'return',
    title: 'Leftover Material Returned',
    description: `${quantityReturned} ${data.unit || 'units'} of ${data.itemName} returned from job ${data.jobId} (${data.condition})`,
    actionLabel: 'View Returns',
  });
  await activity.save();

  return saved;
};

/**
 * Fetches all RMA cases sorted by most recent first.
 */
exports.getRmaCases = async () => {
  return await RmaCase.find().sort({ createdAt: -1 });
};

/**
 * Creates a new RMA case and logs the activity.
 */
exports.createRmaCase = async (data, user) => {
  assertRole(user, ['INVENTORY']);
  const rmaId = generateId('RMA');
  const reportedBy = user?.fullName || 'Inventory Manager';
  const serialNumber = String(data.serialNumber || '').trim();
  if (!serialNumber || !String(data.faultDescription || '').trim()) {
    throw serviceError('Serial number and fault description are required', 400, 'RMA_DETAILS_REQUIRED');
  }
  const inventoryItem = await Inventory.findOne({ serialNumbers: serialNumber });
  if (!inventoryItem) throw serviceError('Serial number was not found in inventory', 404, 'SERIAL_NOT_FOUND');
  if (await RmaCase.exists({ serialNumber, status: { $nin: ['resolved', 'closed'] } })) {
    throw serviceError('An active RMA case already exists for this serial number', 409, 'ACTIVE_RMA_EXISTS');
  }

  const rmaCase = new RmaCase({
    rmaId,
    inventoryId: inventoryItem._id,
    serialNumber,
    itemName: inventoryItem.name,
    itemSku: inventoryItem.sku,
    faultDescription: data.faultDescription,
    reportedBy,
    status: 'reported',
    type: inventoryItem.type,
    resolution: '',
  });

  const saved = await rmaCase.save();

  const activity = new Activity({
    type: 'return',
    title: 'RMA Case Created',
    description: `RMA ${rmaId} filed for ${data.serialNumber}: ${data.faultDescription}`,
    actionLabel: 'View RMA',
  });
  await activity.save();

  return saved;
};

/**
 * Updates an RMA case status with transition validation.
 * Valid transitions: reported → under-review → sent-to-supplier → resolved → closed
 */
exports.updateRmaCase = async (id, data, user) => {
  assertRole(user, ['INVENTORY']);
  const rmaCase = await RmaCase.findOne({ rmaId: id });
  if (!rmaCase) throw serviceError('RMA case not found', 404, 'RMA_NOT_FOUND');

  const validTransitions = {
    'reported': ['under-review'],
    'under-review': ['sent-to-supplier', 'resolved'],
    'sent-to-supplier': ['resolved'],
    'resolved': ['closed'],
    'closed': [],
  };

  if (data.status && data.status !== rmaCase.status) {
    const allowed = validTransitions[rmaCase.status] || [];
    if (!allowed.includes(data.status)) {
      throw new Error(`Invalid status transition from '${rmaCase.status}' to '${data.status}'`);
    }

    rmaCase.status = data.status;

    if (data.status === 'resolved' || data.status === 'closed') {
      rmaCase.resolvedAt = rmaCase.resolvedAt || new Date();
    }
  }

  if (data.resolution !== undefined) {
    rmaCase.resolution = data.resolution;
  }

  const saved = await rmaCase.save();

  const activity = new Activity({
    type: 'return',
    title: 'RMA Status Updated',
    description: `RMA ${rmaCase.rmaId} status changed to ${rmaCase.status}`,
    actionLabel: 'View RMA',
  });
  await activity.save();

  return saved;
};

/**
 * Fetches all active quarantine items (status = 'quarantined').
 */
exports.getQuarantineItems = async () => {
  return await QuarantineItem.find({ status: 'quarantined' }).sort({ createdAt: -1 });
};

/**
 * Manually adds an item to the quarantine zone.
 */
exports.createQuarantineItem = async (data, user) => {
  assertRole(user, ['INVENTORY']);
  const quarantineId = generateId('QZ');
  const quantity = Number(data.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0 || !String(data.itemName || '').trim() || !String(data.reason || '').trim()) {
    throw serviceError('Item name, reason and a positive whole quantity are required', 400, 'INVALID_QUARANTINE_ITEM');
  }

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

  const saved = await quarantineItem.save();

  const activity = new Activity({
    type: 'alert',
    title: 'Item Quarantined',
    description: `${quantity} ${data.unit || 'units'} of ${data.itemName} added to quarantine: ${data.reason}`,
    actionLabel: 'View Quarantine',
  });
  await activity.save();

  return saved;
};

/**
 * Disposes a quarantine item — updates status and records audit trail.
 */
exports.disposeQuarantineItem = async (id, user) => {
  assertRole(user, ['INVENTORY']);
  const item = await QuarantineItem.findOne({ quarantineId: id });
  if (!item) throw new Error('Quarantine item not found');
  if (item.status !== 'quarantined') throw new Error('Item is already disposed');

  item.status = 'disposed';
  item.disposedAt = new Date();
  item.disposedBy = user?.fullName || 'Inventory Manager';

  const saved = await item.save();

  const activity = new Activity({
    type: 'alert',
    title: 'Quarantine Item Disposed',
    description: `${item.quantity} ${item.unit} of ${item.itemName} disposed from quarantine`,
    actionLabel: 'View Quarantine',
  });
  await activity.save();

  return saved;
};

/**
 * Aggregates summary stats for the returns page header.
 */
exports.getReturnsSummary = async () => {
  const totalReturns = await LeftoverReturn.countDocuments();
  const restoredToStock = await LeftoverReturn.countDocuments({ restoredToStock: true });
  const movedToQuarantine = await LeftoverReturn.countDocuments({ movedToQuarantine: true });

  const activeRmaCases = await RmaCase.countDocuments({ status: { $nin: ['closed'] } });
  const totalRmaCases = await RmaCase.countDocuments();

  const quarantineCount = await QuarantineItem.countDocuments({ status: 'quarantined' });
  const disposedCount = await QuarantineItem.countDocuments({ status: 'disposed' });

  return {
    leftoverReturns: {
      total: totalReturns,
      restoredToStock,
      movedToQuarantine,
    },
    rmaCases: {
      total: totalRmaCases,
      active: activeRmaCases,
    },
    quarantine: {
      active: quarantineCount,
      disposed: disposedCount,
    },
  };
};
