const Inventory = require('../../models/Inventory');
const Activity = require('../../models/Activity');
const Supplier = require('../../models/Supplier');
const Procurement = require('../../models/Procurement');
const DispatchOrder = require('../../models/DispatchOrder');
const WarehousePickRequest = require('../../models/WarehousePickRequest');
const JobMaterialRequest = require('../../models/JobMaterialRequest');
const AssetLoan = require('../../models/AssetLoan');
const PurchaseRequest = require('../../models/PurchaseRequest');
const ReceiptAuthorization = require('../../models/ReceiptAuthorization');
const LeftoverReturn = require('../../models/LeftoverReturn');
const RmaCase = require('../../models/RmaCase');
const QuarantineItem = require('../../models/QuarantineItem');
const ReceiptDiscrepancy = require('../../models/ReceiptDiscrepancy');
const SerializedAsset = require('../../models/SerializedAsset');
const ServiceTicket = require('../../models/ServiceTicket');
const InspectionTicket = require('../../models/InspectionTicket');
const Installation = require('../../models/Installation');
const User = require('../../models/User');
const TechTeam = require('../shared/tech-teams/techTeam.model');
const materialWorkflow = require('../shared/jobMaterialRequest/jobMaterialRequest.service');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const {
  deriveStockStatus,
  legacyStockStatus,
  isLowStock,
  normalizeStringList,
  suggestedOrderQuantity,
  isValidClassification,
  INVENTORY_LOCATIONS,
  isValidInventoryLocation
} = require('../../utils/inventory-domain');
const {
  ACTIVE_INCOMING_STATUSES,
  canonicalPurchaseStatus,
  outstandingQuantity,
  fulfillmentStatus,
  NON_PO_REASONS,
  purchaseRequestWorkflowStages,
  receiptAuthorizationWorkflowStages,
  summarizeProcurementWorkflow,
} = require('../../utils/purchase-workflow');
const {
  nextDiscrepancyState,
  normalizeReceiptDisposition,
  receiptProgress,
} = require('./receipt-disposition');
const { normalizeSerialNumber } = require('../../utils/serialized-asset-domain');
const { buildDispatchMutation } = require('../../utils/dispatch-workflow');
const {
  assertPurchaseStatusVersion,
  savePurchaseRequest,
} = require('../../utils/purchase-request-concurrency');
const {
  RMA_STATUSES,
  VALID_RMA_TRANSITIONS,
  dispositionForReturnCondition,
  assertRmaTransition,
  assertReplacementSerial,
} = require('../../utils/rma-workflow');

const MASTER_DATA_FIELDS = [
  'name', 'itemClass', 'subcategory', 'brand', 'manufacturerPartNumber', 'type', 'unit',
  'reorderLevel', 'maxStockLevel', 'unitCost', 'location', 'binLocation', 'supplierId',
  'isSerialized', 'compatibleModels', 'systemType', 'refrigerants', 'capacityBtu',
  'voltage', 'phase', 'specsUrl'
];
const PROTECTED_STOCK_FIELDS = ['available', 'reserved', 'serialNumbers', 'status', 'category'];
const TECHNICIAN_ROLES = ['MAIN_TECH', 'SERVICE_TEAM', 'INSPECTION'];
const MATERIAL_REQUEST_UPDATE_FIELDS = ['status', 'items', 'serviceTeam', 'completedAt', 'lastMovedAt'];

function normalizeInventoryData(data, applyDefaults = true) {
  const normalized = { ...data };
  if (!normalized.itemClass && applyDefaults) normalized.itemClass = 'Unclassified';
  if (!normalized.subcategory && applyDefaults) normalized.subcategory = 'Unclassified';
  if (normalized.itemClass) normalized.category = normalized.itemClass;
  else delete normalized.category;
  if (normalized.supplierId === '') delete normalized.supplierId;
  if (normalized.location !== undefined) normalized.location = String(normalized.location).trim();
  if (normalized.binLocation !== undefined) normalized.binLocation = String(normalized.binLocation).trim();
  for (const field of ['compatibleModels', 'refrigerants', 'serialNumbers']) {
    if (normalized[field] !== undefined) normalized[field] = normalizeStringList(normalized[field]);
  }
  return normalized;
}

function serviceError(message, statusCode, code, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
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

function discrepancyLookup(id) {
  return mongoose.isValidObjectId(id) ? { _id: id } : { discrepancyId: id };
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
    'items', 'supplierId', 'supplierName', 'priority', 'notes', 'source', 'sourceMaterialRequestId',
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
  if (!isValidInventoryLocation(data.location, data.binLocation)) {
    throw serviceError('Select a valid warehouse and placement area', 400, 'INVALID_STORAGE_LOCATION');
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

async function projectSerialNumbers(items) {
  const list = (Array.isArray(items) ? items : [items]).filter(Boolean);
  if (!list.length) return Array.isArray(items) ? [] : null;
  const assets = await SerializedAsset.find({
    inventoryId: { $in: list.map((item) => item._id) },
    status: { $ne: 'retired' },
  }).select('inventoryId serialNumber').sort({ serialNumber: 1 }).lean();
  const serialsByInventory = new Map();
  for (const asset of assets) {
    const key = String(asset.inventoryId);
    if (!serialsByInventory.has(key)) serialsByInventory.set(key, []);
    serialsByInventory.get(key).push(asset.serialNumber);
  }
  const projected = list.map((item) => {
    const value = item.toObject ? item.toObject({ virtuals: true }) : { ...item };
    value.status = legacyStockStatus(value.available, value.reorderLevel);
    value.serialNumbers = serialsByInventory.get(String(value._id)) || [];
    return value;
  });
  return Array.isArray(items) ? projected : projected[0];
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

  const inventoryIds = new Set(inventory.map((item) => String(item._id)));
  const procurementWorkflow = summarizeProcurementWorkflow(orderRequests, authorizations, { inventoryIds });

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
    procurementWorkflow,
  };
};

/**
 * Fetches all inventory items sorted by name.
 */
exports.getInventoryList = async () => {
  const items = await Inventory.find().populate('supplierId', 'name').sort({ name: 1 });
  return projectSerialNumbers(items);
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
  placementAreas: [...location.placementAreas],
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
  return projectSerialNumbers(existing);
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
  const authorizations = await ReceiptAuthorization.find(query)
    .populate('inventoryId', 'name sku available reorderLevel itemClass subcategory brand isSerialized')
    .populate('supplierId', 'name')
    .sort({ createdAt: -1 })
    .lean();
  return authorizations.map((authorization) => ({
    ...authorization,
    workflowStages: receiptAuthorizationWorkflowStages(authorization),
  }));
};

/** Posts an issued PO line or approved Non-PO authorization through one transaction. */
exports.receiveInventory = async (data, user) => {
  assertRole(user, ['INVENTORY']);
  const mode = data.receiptMode;
  if (!['PO', 'NON_PO'].includes(mode)) {
    throw serviceError('receiptMode must be PO or NON_PO; legacy direct receipts are no longer accepted', 400, 'RECEIPT_MODE_REQUIRED');
  }
  const disposition = normalizeReceiptDisposition(data);
  const { quantity, acceptedQuantity, damagedQuantity, missingQuantity } = disposition;
  const location = String(data.location || '').trim();
  const binLocation = String(data.binLocation || '').trim();
  if (!isValidInventoryLocation(location, binLocation)) {
    throw serviceError(
      'Select a valid warehouse and placement area for received stock',
      400,
      'INVALID_STORAGE_LOCATION',
    );
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
  const hasExplicitBreakdown = ['acceptedQuantity', 'damagedQuantity', 'missingQuantity']
    .some((field) => data[field] !== undefined && data[field] !== null && data[field] !== '');
  const legacyDamagedSerials = !hasExplicitBreakdown && disposition.condition === 'Damaged';
  const submittedSerials = legacyDamagedSerials ? [] : Array.isArray(data.serialNumbers) ? data.serialNumbers : [];
  const submittedDamagedSerials = Array.isArray(data.damagedSerialNumbers)
    ? data.damagedSerialNumbers
    : legacyDamagedSerials && Array.isArray(data.serialNumbers) ? data.serialNumbers : [];
  const serialNumbers = normalizeStringList(submittedSerials);
  const damagedSerialNumbers = normalizeStringList(submittedDamagedSerials);
  const normalizedReportedSerials = [...serialNumbers, ...damagedSerialNumbers].map(normalizeSerialNumber);
  if (serialNumbers.length !== submittedSerials.length) {
    throw serviceError('Accepted serial numbers must be unique within the receipt', 409, 'DUPLICATE_SERIAL');
  }
  if (damagedSerialNumbers.length !== submittedDamagedSerials.length
    || normalizedReportedSerials.some((serial) => !serial)
    || new Set(normalizedReportedSerials).size !== normalizedReportedSerials.length) {
    throw serviceError('Accepted and damaged serial numbers must be unique within the receipt', 409, 'DUPLICATE_SERIAL');
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
      let replacementDiscrepancy;

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

      if (data.discrepancyId) {
        replacementDiscrepancy = await ReceiptDiscrepancy.findOne(discrepancyLookup(data.discrepancyId)).session(session);
        if (!replacementDiscrepancy) {
          throw serviceError('Receipt discrepancy not found', 404, 'DISCREPANCY_NOT_FOUND');
        }
        if (!['open', 'supplier-contacted', 'replacement-pending'].includes(replacementDiscrepancy.status)) {
          throw serviceError('This discrepancy is not awaiting replacement', 409, 'DISCREPANCY_NOT_OPEN');
        }
        if (String(replacementDiscrepancy.inventoryId) !== String(item._id)
          || String(replacementDiscrepancy.supplierId) !== String(supplier._id)
          || replacementDiscrepancy.receiptMode !== mode
          || mode === 'PO' && (String(replacementDiscrepancy.orderRequestId) !== String(order._id)
            || replacementDiscrepancy.orderLineId !== orderLine.lineId)
          || mode === 'NON_PO' && String(replacementDiscrepancy.receiptAuthorizationId) !== String(authorization._id)) {
          throw serviceError(
            'Replacement receipt must use the original supplier, item, and workflow source',
            409,
            'DISCREPANCY_SOURCE_MISMATCH',
          );
        }
        nextDiscrepancyState(replacementDiscrepancy, disposition);
      }

      if (item.isSerialized && serialNumbers.length !== acceptedQuantity) {
        throw serviceError('Serialized items require one accepted serial number per accepted unit', 400, 'SERIAL_COUNT_MISMATCH');
      }
      if (item.isSerialized && damagedSerialNumbers.length !== damagedQuantity) {
        throw serviceError('Serialized items require one damaged serial number per damaged unit', 400, 'DAMAGED_SERIAL_COUNT_MISMATCH');
      }
      if (!item.isSerialized && (serialNumbers.length || damagedSerialNumbers.length)) {
        throw serviceError('Serial numbers are only allowed for serialized items', 400, 'UNEXPECTED_SERIALS');
      }
      if (normalizedReportedSerials.length
        && await SerializedAsset.exists({ normalizedSerial: { $in: normalizedReportedSerials } }).session(session)) {
        throw serviceError('One or more serial numbers already exist in inventory', 409, 'DUPLICATE_SERIAL');
      }
      if (await Procurement.exists({ receiptEventId }).session(session)) {
        throw serviceError('This receipt submission has already been posted', 409, 'DUPLICATE_RECEIPT_EVENT');
      }

      if (acceptedQuantity > 0) {
        item.available += acceptedQuantity;
        item.supplierId = supplier._id;
        item.location = location;
        item.binLocation = binLocation;
        item.unitCost = receiptUnitCost;
        item.status = legacyStockStatus(item.available, item.reorderLevel);
        await item.save({ session });
      }

      if (order) {
        orderLine.receivedQuantity += acceptedQuantity;
        order.status = fulfillmentStatus(order.items);
        order.statusVersion += 1;
        await order.save({ session });
      }
      if (authorization) {
        const progress = receiptProgress(authorization, acceptedQuantity);
        authorization.receivedQuantity = progress.receivedQuantity;
        authorization.status = progress.status;
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
        acceptedQuantity,
        damagedQuantity,
        missingQuantity,
        unit: item.unit,
        unitCost: receiptUnitCost,
        totalCost: acceptedQuantity * receiptUnitCost,
        acceptedTotalCost: acceptedQuantity * receiptUnitCost,
        disputedTotalCost: (damagedQuantity + missingQuantity) * receiptUnitCost,
        replacementForDiscrepancyId: replacementDiscrepancy?._id,
        damagedSerialNumbers,
        location,
        binLocation,
        receivedBy: actorName(user, 'Inventory Manager'),
        receivedDate: data.receivedDate || new Date(),
        condition: disposition.condition,
      }], { session });

      let discrepancy;
      if (replacementDiscrepancy) {
        const nextState = nextDiscrepancyState(replacementDiscrepancy, disposition);
        replacementDiscrepancy.outstandingQuantity = nextState.outstandingQuantity;
        replacementDiscrepancy.resolvedQuantity = nextState.resolvedQuantity;
        replacementDiscrepancy.status = nextState.status;
        replacementDiscrepancy.replacementProcurementIds.push(procurement._id);
        replacementDiscrepancy.resolvedAt = nextState.status === 'resolved' ? new Date() : undefined;
        await replacementDiscrepancy.save({ session });
        discrepancy = replacementDiscrepancy;
      } else if (damagedQuantity + missingQuantity > 0) {
        [discrepancy] = await ReceiptDiscrepancy.create([{
          discrepancyId: generateReference('DISC'),
          receiptEventId,
          inventoryId: item._id,
          procurementId: procurement._id,
          supplierId: supplier._id,
          supplierName: supplier.name,
          itemName: item.name,
          sku: item.sku,
          receiptMode: mode,
          orderRequestId: order?._id,
          orderLineId: orderLine?.lineId || '',
          receiptAuthorizationId: authorization?._id,
          sourceDocumentNumber,
          expectedQuantity: quantity,
          acceptedQuantity,
          damagedQuantity,
          missingQuantity,
          outstandingQuantity: damagedQuantity + missingQuantity,
          unit: item.unit,
          unitCost: receiptUnitCost,
          disputedValue: (damagedQuantity + missingQuantity) * receiptUnitCost,
          acceptedSerialNumbers: serialNumbers,
          damagedSerialNumbers,
          reportedById: user._id,
          reportedByName: actorName(user, 'Inventory Manager'),
        }], { session });
        procurement.discrepancyId = discrepancy._id;
        await procurement.save({ session });
      }

      let quarantine;
      if (damagedQuantity > 0) {
        [quarantine] = await QuarantineItem.create([{
          quarantineId: generateReference('Q'),
          itemName: item.name,
          quantity: damagedQuantity,
          unit: item.unit,
          reason: `Damaged supplier receipt ${sourceDocumentNumber}`,
          location,
          source: 'receipt',
          sourceRefId: receiptEventId,
          inventoryId: item._id,
          procurementId: procurement._id,
          supplierId: supplier._id,
          serialNumbers: damagedSerialNumbers,
        }], { session });
      }

      if (item.isSerialized && normalizedReportedSerials.length) {
        const commonAssetFields = {
          inventoryId: item._id,
          supplierId: supplier._id,
          procurementId: procurement._id,
          receiptDiscrepancyId: discrepancy?._id,
          receiptEventId,
          location,
          binLocation,
          origin: 'receipt',
        };
        await SerializedAsset.create([
          ...serialNumbers.map((serialNumber) => ({
            ...commonAssetFields,
            serialNumber,
            status: 'available',
          })),
          ...damagedSerialNumbers.map((serialNumber) => ({
            ...commonAssetFields,
            serialNumber,
            status: 'quarantined',
            quarantineId: quarantine?._id,
          })),
        ], { session });
      }

      await Activity.create([{
        type: 'grn', title: 'Goods Received',
        description: `${mode} receipt for ${item.name}: ${acceptedQuantity} accepted, ${damagedQuantity} damaged, ${missingQuantity} missing from ${supplier.name}`,
        actionLabel: 'View GRN',
      }], { session });
      return {
        itemId: item._id,
        procurementId: procurement._id,
        discrepancyId: discrepancy?._id,
        quarantineId: quarantine?._id,
      };
    });

    return {
      item: await projectSerialNumbers(await Inventory.findById(result.itemId).populate('supplierId', 'name')),
      procurement: await Procurement.findById(result.procurementId)
        .populate('supplierId', 'name')
        .populate('receiptAuthorizationId'),
      discrepancy: result.discrepancyId
        ? await ReceiptDiscrepancy.findById(result.discrepancyId)
        : null,
      quarantine: result.quarantineId ? await QuarantineItem.findById(result.quarantineId) : null,
    };
  } catch (error) {
    if (error.code === 11000) {
      const field = error.keyPattern?.sku
        ? 'SKU'
        : error.keyPattern?.normalizedSerial || error.keyPattern?.serialNumbers
          ? 'serial number'
          : 'source document';
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
    .populate('discrepancyId', 'discrepancyId status outstandingQuantity')
    .populate('replacementForDiscrepancyId', 'discrepancyId status outstandingQuantity')
    .sort({ timestamp: -1 })
    .limit(100);
};

exports.getReceiptDiscrepancies = async (filters = {}) => {
  const query = {};
  if (filters.status && filters.status !== 'all') query.status = filters.status;
  return ReceiptDiscrepancy.find(query)
    .populate('inventoryId', 'name sku')
    .populate('supplierId', 'name')
    .populate('orderRequestId', 'requestId poNumber status')
    .populate('receiptAuthorizationId', 'authorizationNumber status')
    .populate('replacementProcurementIds', 'sourceDocumentNumber receivedDate acceptedQuantity')
    .sort({ createdAt: -1 });
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
  const order = await DispatchOrder.findOne({ orderId: id }).lean();
  if (!order) throw serviceError('Dispatch order not found', 404, 'DISPATCH_NOT_FOUND');
  const mutation = buildDispatchMutation(order, data);
  const update = { $set: mutation.set, $inc: { statusVersion: 1 } };
  if (Object.keys(mutation.unset).length) update.$unset = mutation.unset;
  const updated = await DispatchOrder.findOneAndUpdate({
    _id: order._id,
    status: order.status,
    statusVersion: data.statusVersion,
  }, update, { returnDocument: 'after', runValidators: true });
  if (!updated) throw serviceError('This dispatch changed; refresh before trying again', 409, 'STALE_DISPATCH');
  if (mutation.transitioned) {
    await Activity.create({
      type: 'dispatch',
      title: data.undo === true ? 'Dispatch Stage Restored' : 'Dispatch Stage Advanced',
      description: `${order.orderId}: ${mutation.previousStatus} → ${mutation.nextStatus}`,
      actionLabel: 'View Dispatch',
    });
  }
  return updated;
};

/**
 * Fetches all material requests sorted by creation date.
 */
exports.getMaterialRequests = async () => {
  const requests = await WarehousePickRequest.find({ status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).lean();
  const inventoryIds = [...new Set(requests.flatMap(request => request.items || [])
    .map(item => String(item.inventoryId || ''))
    .filter(id => mongoose.isValidObjectId(id)))];
  const inventory = inventoryIds.length
    ? await Inventory.find({ _id: { $in: inventoryIds } })
      .select('name sku available reserved unit unitCost itemClass subcategory supplierId manufacturerPartNumber')
      .populate('supplierId', 'name')
      .lean()
    : [];
  const byId = new Map(inventory.map(item => [String(item._id), item]));
  return requests.map(request => {
    const items = (request.items || []).map(item => {
      const stock = byId.get(String(item.inventoryId));
      const available = Number(stock?.available || 0);
      const shortage = request.status === 'pending' ? Math.max(0, Number(item.qty) - available) : 0;
      return {
        ...item,
        available,
        reservedStock: Number(stock?.reserved || 0),
        unit: stock?.unit || 'units',
        unitCost: Number(stock?.unitCost || 0),
        itemClass: stock?.itemClass || 'Unclassified',
        subcategory: stock?.subcategory || 'Unclassified',
        manufacturerPartNumber: stock?.manufacturerPartNumber || '',
        supplierId: stock?.supplierId?._id || stock?.supplierId,
        supplierName: stock?.supplierId?.name || '',
        shortage,
      };
    });
    return { ...request, items, hasShortage: items.some(item => item.shortage > 0) };
  });
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

function assertRequestVersion(request, version) {
  if (version !== undefined && Number(version) !== Number(request.statusVersion)) {
    throw serviceError('The material request changed; reload before trying again', 409, 'STALE_MATERIAL_REQUEST');
  }
}

async function materialRequestByReference(id, session) {
  const request = await WarehousePickRequest.findOne({ requestId: id }).session(session || null);
  if (!request) throw serviceError('Material request not found', 404, 'MATERIAL_REQUEST_NOT_FOUND');
  return request;
}

exports.confirmMaterialItem = async (id, lineId, data, user) => {
  assertRole(user, ['INVENTORY']);
  const request = await materialRequestByReference(id);
  assertRequestVersion(request, data.statusVersion);
  if (request.status !== 'pending') {
    throw serviceError('Only pending requests can be checked', 409, 'INVALID_MATERIAL_TRANSITION');
  }
  const item = request.items.find(line => line.lineId === lineId);
  if (!item) throw serviceError('Material line not found', 404, 'MATERIAL_LINE_NOT_FOUND');
  const updated = await WarehousePickRequest.findOneAndUpdate({
    _id: request._id,
    status: 'pending',
    statusVersion: request.statusVersion,
  }, {
    $set: { 'items.$[materialLine].confirmed': Boolean(data.confirmed) },
    $inc: { statusVersion: 1 },
  }, {
    arrayFilters: [{ 'materialLine.lineId': lineId }],
    new: true,
    runValidators: true,
  });
  if (!updated) throw serviceError('The material request changed; reload before trying again', 409, 'STALE_MATERIAL_REQUEST');
  return updated;
};

exports.reserveMaterialRequest = async (id, data, user) => {
  assertRole(user, ['INVENTORY']);
  return mongoose.connection.transaction(async session => {
    const request = await materialRequestByReference(id, session);
    assertRequestVersion(request, data.statusVersion);
    if (request.status !== 'pending') {
      throw serviceError('Only pending requests can be reserved', 409, 'INVALID_MATERIAL_TRANSITION');
    }
    if (!request.items.length || request.items.some(item => !item.confirmed)) {
      throw serviceError('Confirm every material line before reserving the kit', 409, 'UNCONFIRMED_MATERIAL_LINES');
    }
    const shortages = [];
    for (const line of request.items) {
      const stock = await Inventory.findById(line.inventoryId).session(session);
      if (!stock || Number(stock.available) < Number(line.qty)) {
        shortages.push({ lineId: line.lineId, sku: line.sku, required: line.qty, available: Number(stock?.available || 0) });
      }
    }
    if (shortages.length) {
      throw serviceError('The complete kit is not available', 409, 'INSUFFICIENT_STOCK', shortages);
    }
    for (const line of request.items) {
      const stock = await Inventory.findOneAndUpdate(
        { _id: line.inventoryId, available: { $gte: line.qty } },
        { $inc: { available: -line.qty, reserved: line.qty } },
        { new: true, runValidators: true, session },
      );
      if (!stock) throw serviceError('Stock changed while reserving; reload and retry', 409, 'INSUFFICIENT_STOCK');
      stock.status = legacyStockStatus(stock.available, stock.reorderLevel);
      await stock.save({ session });
    }
    request.status = 'reserved';
    request.lastMovedAt = new Date();
    request.statusVersion += 1;
    await request.save({ session });
    await JobMaterialRequest.updateOne(
      { _id: request.sourceMaterialRequestId },
      { $set: { fulfillmentStatus: 'RESERVED' }, $inc: { statusVersion: 1 } },
      { session },
    );
    await materialWorkflow.setJobState(request.jobType, request.jobId, 'Materials Ready', null, session);
    await Activity.create([{
      type: 'request',
      title: 'Material Kit Reserved',
      description: `${request.requestId} reserved by ${actorName(user, 'Inventory Manager')}`,
      actionLabel: 'View Request',
    }], { session });
    return request;
  });
};

exports.releaseMaterialRequest = async (id, data, user) => {
  assertRole(user, ['INVENTORY']);
  return mongoose.connection.transaction(async session => {
    const request = await materialRequestByReference(id, session);
    assertRequestVersion(request, data.statusVersion);
    if (request.status !== 'reserved') {
      throw serviceError('Only reserved requests can be released', 409, 'INVALID_MATERIAL_TRANSITION');
    }
    for (const line of request.items) {
      const stock = await Inventory.findOneAndUpdate(
        { _id: line.inventoryId, reserved: { $gte: line.qty } },
        { $inc: { available: line.qty, reserved: -line.qty } },
        { new: true, runValidators: true, session },
      );
      if (!stock) throw serviceError('Reserved stock is inconsistent', 409, 'RESERVED_STOCK_MISMATCH');
      stock.status = legacyStockStatus(stock.available, stock.reorderLevel);
      await stock.save({ session });
    }
    if (request.assignedTeamId) {
      await TechTeam.updateOne(
        { _id: request.assignedTeamId },
        [
          {
            $set: {
              activeJobsCount: { $max: [0, { $subtract: [{ $ifNull: ['$activeJobsCount', 0] }, 1] }] },
            },
          },
          { $set: { status: { $cond: [{ $gt: ['$activeJobsCount', 0] }, 'On Job', 'Available'] } } },
        ],
        { session },
      );
    }
    request.status = 'pending';
    request.lastMovedAt = undefined;
    request.assignedTeamId = undefined;
    request.assignedTeamName = undefined;
    request.statusVersion += 1;
    request.items.forEach(item => { item.confirmed = false; });
    await request.save({ session });
    await JobMaterialRequest.updateOne(
      { _id: request.sourceMaterialRequestId },
      { $set: { fulfillmentStatus: 'PENDING' }, $inc: { statusVersion: 1 } },
      { session },
    );
    const Model = materialWorkflow.modelForJobType(request.jobType);
    await Model.updateOne({ _id: request.jobId }, {
      $set: { status: 'Sent to IM' },
      $unset: { assignedTeam: 1, assignedTeamRef: 1, assignedTeamId: 1, assignedTeamName: 1 },
    }, { session, runValidators: true });
    return request;
  });
};

exports.handoverMaterialRequest = async (id, data, user) => {
  assertRole(user, ['INVENTORY']);
  return mongoose.connection.transaction(async session => {
    const request = await materialRequestByReference(id, session);
    assertRequestVersion(request, data.statusVersion);
    if (request.status !== 'reserved') {
      throw serviceError('Only reserved requests can be handed over', 409, 'INVALID_MATERIAL_TRANSITION');
    }
    if (!request.assignedTeamId) {
      throw serviceError('The Main Technician must assign a service team first', 409, 'TEAM_ASSIGNMENT_REQUIRED');
    }
    for (const line of request.items) {
      const stock = await Inventory.findOneAndUpdate(
        { _id: line.inventoryId, reserved: { $gte: line.qty } },
        { $inc: { reserved: -line.qty } },
        { new: true, runValidators: true, session },
      );
      if (!stock) throw serviceError('Reserved stock is inconsistent', 409, 'RESERVED_STOCK_MISMATCH');
    }
    request.status = 'completed';
    request.completedAt = new Date().toISOString();
    request.lastMovedAt = new Date();
    request.statusVersion += 1;
    await request.save({ session });
    await JobMaterialRequest.updateOne(
      { _id: request.sourceMaterialRequestId },
      { $set: { fulfillmentStatus: 'HANDED_OVER' }, $inc: { statusVersion: 1 } },
      { session },
    );
    await Activity.create([{
      type: 'request',
      title: 'Material Kit Handed Over',
      description: `${request.requestId} handed to ${request.assignedTeamName}`,
      actionLabel: 'View Request',
    }], { session });
    return request;
  });
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
  return AssetLoan.find({ status: { $ne: 'returned' } })
    .populate('serializedAssetId', 'serialNumber status')
    .sort({ checkedOutAt: -1 });
};

/**
 * Returns serialized HVAC tools with asset tags that are not currently on loan.
 */
exports.getAvailableTools = async () => {
  const availableAssets = await SerializedAsset.find({
    status: 'available',
    currentLoanId: { $in: [null, undefined] },
    activeRmaCaseId: { $in: [null, undefined] },
    quarantineId: { $in: [null, undefined] },
  })
    .select('inventoryId serialNumber')
    .sort({ serialNumber: 1 })
    .lean();
  const availableByInventory = new Map();
  for (const asset of availableAssets) {
    const key = String(asset.inventoryId);
    if (!availableByInventory.has(key)) availableByInventory.set(key, []);
    availableByInventory.get(key).push(asset.serialNumber);
  }
  const tools = await Inventory.find({
    _id: { $in: [...availableByInventory.keys()] },
    itemClass: 'Tools and Test Equipment',
    isSerialized: true,
  }).select('name sku itemClass subcategory brand location binLocation available reorderLevel');
  const projected = await projectSerialNumbers(tools);
  return projected.map((tool) => ({
    ...tool,
    availableSerialNumbers: availableByInventory.get(String(tool._id)) || [],
  }));
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
  const normalizedAssetTag = normalizeSerialNumber(data.assetTag);
  try {
    return await mongoose.connection.transaction(async (session) => {
      const asset = await SerializedAsset.findOne({ normalizedSerial: normalizedAssetTag }).session(session);
      if (!asset || String(asset.inventoryId) !== String(data.toolId)) {
        throw serviceError('Serialized tool or asset tag not found', 404, 'TOOL_NOT_FOUND');
      }
      if (asset.status !== 'available') {
        throw serviceError('This asset tag is not available for checkout', 409, 'ASSET_NOT_AVAILABLE');
      }
      const tool = await Inventory.findOne({
        _id: asset.inventoryId,
        itemClass: 'Tools and Test Equipment',
        isSerialized: true,
      }).session(session);
      if (!tool) throw serviceError('Serialized tool or asset tag not found', 404, 'TOOL_NOT_FOUND');

      const activeLoan = await AssetLoan.findOne({
        $or: [{ serializedAssetId: asset._id }, { normalizedAssetTag }],
        status: 'on-loan',
      }).session(session);
      if (activeLoan) {
        throw serviceError('This asset tag is already checked out', 409, 'ASSET_ALREADY_LOANED');
      }
      const loan = new AssetLoan({
        assetTag: asset.serialNumber,
        normalizedAssetTag,
        serializedAssetId: asset._id,
      });
      Object.assign(loan, {
        toolId: tool._id,
        serializedAssetId: asset._id,
        toolName: tool.name,
        assetTag: asset.serialNumber,
        normalizedAssetTag,
        technicianId: String(technician._id),
        technicianUserId: technician._id,
        technicianName: technician.fullName,
        checkedOutAt: new Date(),
        dueDate,
        status: 'on-loan',
        returnedAt: undefined,
        condition: 'good',
      });
      await loan.save({ session });
      asset.status = 'on-loan';
      asset.currentLoanId = loan._id;
      await asset.save({ session });
      await Activity.create([{
        type: 'request', title: 'Tool Checked Out',
        description: `${technician.fullName} checked out ${tool.name} (${asset.serialNumber})`,
        actionLabel: 'View Asset',
      }], { session });
      return loan;
    });
  } catch (error) {
    if (error.code === 11000) {
      throw serviceError('This asset tag is already checked out', 409, 'ASSET_ALREADY_LOANED');
    }
    throw error;
  }
};

/**
 * Processes a tool return, archiving the loan and logging the return event.
 */
exports.returnTool = async (loanId, user, input = {}) => {
  assertRole(user, ['INVENTORY']);
  assertObjectId(loanId, 'Loan reference is invalid', 'INVALID_LOAN_ID');
  const condition = input.condition || 'good';
  const disposition = dispositionForReturnCondition(condition);

  return mongoose.connection.transaction(async (session) => {
    const loan = await AssetLoan.findById(loanId).session(session);
    if (!loan) throw serviceError('Loan not found', 404, 'LOAN_NOT_FOUND');
    if (loan.status === 'returned') throw serviceError('This loan has already been returned', 409, 'ASSET_ALREADY_RETURNED');
    const asset = loan.serializedAssetId
      ? await SerializedAsset.findById(loan.serializedAssetId).session(session)
      : await SerializedAsset.findOne({ normalizedSerial: normalizeSerialNumber(loan.assetTag) }).session(session);
    if (!asset) throw serviceError('Serialized asset registry record not found', 409, 'ASSET_REGISTRY_MISSING');
    if (asset.status !== 'on-loan' || String(asset.currentLoanId || '') !== String(loan._id)) {
      throw serviceError('Serialized asset loan state is inconsistent', 409, 'ASSET_LOAN_STATE_CONFLICT');
    }
    loan.serializedAssetId = asset._id;
    loan.status = 'returned';
    loan.returnedAt = new Date();
    loan.condition = condition;
    if (input.notes) loan.notes = input.notes;
    await loan.save({ session });

    if (condition === 'good') {
      asset.status = 'available';
      asset.quarantineId = undefined;
    } else if (condition === 'incomplete') {
      const [quarantine] = await QuarantineItem.create([{
        quarantineId: generateId('QZ'),
        itemName: loan.toolName,
        quantity: 1,
        unit: 'unit',
        reason: input.notes
          ? `Returned tool marked incomplete: ${loan.assetTag} - ${input.notes}`
          : `Returned tool marked incomplete: ${loan.assetTag}`,
        source: 'manual',
        sourceRefId: String(loan._id),
        inventoryId: loan.toolId,
        serialNumbers: [asset.serialNumber],
      }], { session });
      asset.status = 'inspection-hold';
      asset.quarantineId = quarantine._id;
    } else if (condition === 'damaged') {
      const [quarantine] = await QuarantineItem.create([{
        quarantineId: generateId('QZ'),
        itemName: loan.toolName,
        quantity: 1,
        unit: 'unit',
        reason: input.notes
          ? `Returned tool marked damaged: ${loan.assetTag} - ${input.notes}`
          : `Returned tool marked damaged: ${loan.assetTag}`,
        source: 'manual',
        sourceRefId: String(loan._id),
        inventoryId: loan.toolId,
        serialNumbers: [asset.serialNumber],
      }], { session });

      const rmaId = generateId('RMA');
      const inventoryItem = await Inventory.findById(asset.inventoryId).session(session);
      const [rmaCase] = await RmaCase.create([{
        rmaId,
        inventoryId: asset.inventoryId,
        serializedAssetId: asset._id,
        serialNumber: asset.serialNumber,
        itemName: loan.toolName,
        itemSku: inventoryItem ? inventoryItem.sku : '',
        faultDescription: input.notes || `Returned tool marked damaged: ${loan.assetTag}`,
        reportedBy: user?.fullName || 'Inventory Manager',
        status: 'reported',
        type: inventoryItem ? inventoryItem.type : 'Single',
        resolution: '',
      }], { session });

      asset.status = 'supplier-return-pending';
      asset.activeRmaCaseId = rmaCase._id;
      asset.preRmaStatus = 'supplier-return-pending';
      asset.quarantineId = quarantine._id;
    }
    asset.currentLoanId = undefined;
    await asset.save({ session });
    await Activity.create([{
      type: 'return', title: 'Tool Returned',
      description: `${loan.technicianName} returned ${loan.toolName} (${loan.assetTag}) [${condition}]`,
      actionLabel: 'View Log',
    }], { session });
    return loan;
  });
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
  const requests = await PurchaseRequest.find()
    .populate('items.supplierId', 'name')
    .sort({ createdAt: -1 })
    .lean();
  return requests.map((request) => ({
    ...request,
    status: canonicalPurchaseStatus(request.status),
    workflowStages: purchaseRequestWorkflowStages(request),
  }));
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
  if (safe.source === 'material-request') {
    assertObjectId(safe.sourceMaterialRequestId, 'Material request reference is invalid', 'INVALID_MATERIAL_REQUEST_ID');
    const materialRequest = await WarehousePickRequest.findOne({
      $or: [{ _id: safe.sourceMaterialRequestId }, { sourceMaterialRequestId: safe.sourceMaterialRequestId }],
      status: 'pending',
    });
    if (!materialRequest) {
      throw serviceError('A pending warehouse request is required for a shortage order', 409, 'MATERIAL_REQUEST_NOT_PENDING');
    }
    const duplicate = await PurchaseRequest.exists({
      source: 'material-request',
      sourceMaterialRequestId: materialRequest.sourceMaterialRequestId,
      supplierId: supplierId || null,
      status: { $nin: ['rejected', 'received'] },
    });
    if (duplicate) throw serviceError('An active shortage order already exists for this supplier', 409, 'DUPLICATE_SHORTAGE_ORDER');
    safe.sourceMaterialRequestId = materialRequest.sourceMaterialRequestId;
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
    sourceMaterialRequestId: safe.sourceMaterialRequestId,
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
  if (String(request.requestedById || '') !== String(user._id)) {
    throw serviceError('Only the requester can edit this purchase request', 403, 'NOT_REQUEST_OWNER');
  }
  assertPurchaseStatusVersion(request, data.statusVersion);
  if (!['draft', 'rejected'].includes(canonicalPurchaseStatus(request.status))) {
    throw serviceError('Only draft or rejected requests can be edited', 409, 'ORDER_LOCKED');
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
  return savePurchaseRequest(request);
};

exports.submitOrderRequest = async (id, data, user) => {
  assertRole(user, ['INVENTORY']);
  const request = await PurchaseRequest.findOne(orderLookup(id));
  if (!request) throw serviceError('Order request not found', 404, 'ORDER_NOT_FOUND');
  if (String(request.requestedById || '') !== String(user._id)) {
    throw serviceError('Only the requester can submit this purchase request', 403, 'NOT_REQUEST_OWNER');
  }
  assertPurchaseStatusVersion(request, data.statusVersion);
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
  await savePurchaseRequest(request);
  await Activity.create({
    type: 'request', title: 'Purchase Request Submitted',
    description: `${request.requestId} submitted to Manager for operational approval`, actionLabel: 'View Request',
  });
  return request;
};

exports.issuePurchaseOrder = async (id, data, user) => {
  assertRole(user, ['INVENTORY']);
  const request = await PurchaseRequest.findOne(orderLookup(id));
  if (!request) throw serviceError('Order request not found', 404, 'ORDER_NOT_FOUND');
  assertPurchaseStatusVersion(request, data.statusVersion);
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
  await savePurchaseRequest(request);
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
  if (!String(data.warehousePickRequestId || '').trim() || !String(data.warehouseLineId || '').trim()) {
    throw serviceError('Completed warehouse request and line references are required', 400, 'HANDOVER_REFERENCE_REQUIRED');
  }
  return mongoose.connection.transaction(async session => {
    const reference = String(data.warehousePickRequestId).trim();
    const warehouseClauses = [{ requestId: reference }];
    if (mongoose.isValidObjectId(reference)) warehouseClauses.push({ _id: reference });
    const warehouse = await WarehousePickRequest.findOne({ $or: warehouseClauses }).session(session);
    if (!warehouse || warehouse.status !== 'completed') {
      throw serviceError('Returns require a completed material handover', 409, 'HANDOVER_NOT_COMPLETED');
    }
    assertRequestVersion(warehouse, data.statusVersion);
    const line = warehouse.items.find(item => item.lineId === data.warehouseLineId);
    if (!line) throw serviceError('Warehouse material line not found', 404, 'MATERIAL_LINE_NOT_FOUND');
    const alreadyReturned = await LeftoverReturn.aggregate([
      { $match: { warehousePickRequestId: warehouse._id, warehouseLineId: line.lineId } },
      { $group: { _id: null, quantity: { $sum: '$quantityReturned' } } },
    ]).session(session);
    if (Number(alreadyReturned[0]?.quantity || 0) + quantityReturned > Number(line.qty)) {
      throw serviceError('Return quantity exceeds the handed-over quantity', 409, 'RETURN_EXCEEDS_HANDOVER');
    }
    const returnReservation = await WarehousePickRequest.updateOne({
      _id: warehouse._id,
      status: 'completed',
      statusVersion: warehouse.statusVersion,
      $expr: {
        $anyElementTrue: {
          $map: {
            input: '$items',
            as: 'materialLine',
            in: {
              $and: [
                { $eq: ['$$materialLine.lineId', line.lineId] },
                {
                  $lte: [
                    { $add: [{ $ifNull: ['$$materialLine.returnedQty', 0] }, quantityReturned] },
                    '$$materialLine.qty',
                  ],
                },
              ],
            },
          },
        },
      },
    }, {
      $inc: { 'items.$[materialLine].returnedQty': quantityReturned, statusVersion: 1 },
    }, {
      arrayFilters: [{ 'materialLine.lineId': line.lineId }],
      session,
    });
    if (returnReservation.modifiedCount !== 1) {
      throw serviceError('Return quantity exceeds the handover or the request changed', 409, 'RETURN_EXCEEDS_HANDOVER');
    }
    const inventoryItem = await Inventory.findById(line.inventoryId).session(session);
    if (!inventoryItem) throw serviceError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
    const returnId = generateId('LR');
    const [leftoverReturn] = await LeftoverReturn.create([{
      returnId,
      jobId: String(warehouse.jobId),
      warehousePickRequestId: warehouse._id,
      warehouseLineId: line.lineId,
      itemId: inventoryItem._id,
      itemName: line.name,
      itemSku: line.sku,
      quantityReturned,
      condition: data.condition,
      returnedBy: user?.fullName || 'Inventory Manager',
      notes: data.notes || '',
      restoredToStock: data.condition === 'good',
      movedToQuarantine: data.condition !== 'good',
    }], { session });
    if (data.condition === 'good') {
      inventoryItem.available = Number(inventoryItem.available || 0) + quantityReturned;
      inventoryItem.status = legacyStockStatus(inventoryItem.available, inventoryItem.reorderLevel);
      await inventoryItem.save({ session });
    } else {
      await QuarantineItem.create([{
        quarantineId: generateId('QZ'),
        itemName: line.name,
        quantity: quantityReturned,
        unit: data.unit || inventoryItem.unit || 'units',
        reason: `${data.condition === 'scrap' ? 'Scrap' : 'Damaged'} from job ${warehouse.jobId}: ${data.notes || 'No details'}`,
        location: data.location || '',
        source: 'leftover-return',
        sourceRefId: returnId,
      }], { session });
    }
    await Activity.create([{
      type: 'return',
      title: 'Leftover Material Returned',
      description: `${quantityReturned} ${data.unit || inventoryItem.unit || 'units'} of ${line.name} returned from job ${warehouse.jobId} (${data.condition})`,
      actionLabel: 'View Returns',
    }], { session });
    return leftoverReturn;
  });
};

/**
 * Fetches all RMA cases sorted by most recent first.
 */
exports.getRmaCases = async () => {
  return RmaCase.find()
    .populate('serializedAssetId', 'serialNumber status')
    .sort({ createdAt: -1 });
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
  return mongoose.connection.transaction(async (session) => {
    const asset = await SerializedAsset.findOne({ normalizedSerial: normalizeSerialNumber(serialNumber) }).session(session);
    if (!asset) throw serviceError('Serial number was not found in the serialized asset registry', 404, 'SERIAL_NOT_FOUND');
    if (asset.status === 'rma') {
      throw serviceError('An active RMA case already exists for this serial number', 409, 'ACTIVE_RMA_EXISTS');
    }
    if (!['available', 'quarantined', 'inspection-hold', 'supplier-return-pending'].includes(asset.status)) {
      throw serviceError('This serialized asset is not eligible for RMA', 409, 'ASSET_NOT_AVAILABLE');
    }
    const inventoryItem = await Inventory.findById(asset.inventoryId).session(session);
    if (!inventoryItem) throw serviceError('Inventory item not found for serialized asset', 409, 'ASSET_OWNER_MISSING');
    if (await RmaCase.exists({
      serializedAssetId: asset._id,
      status: { $nin: ['resolved', 'closed'] },
    }).session(session)) {
      throw serviceError('An active RMA case already exists for this serial number', 409, 'ACTIVE_RMA_EXISTS');
    }
    const [rmaCase] = await RmaCase.create([{
      rmaId,
      inventoryId: inventoryItem._id,
      serializedAssetId: asset._id,
      serialNumber: asset.serialNumber,
      itemName: inventoryItem.name,
      itemSku: inventoryItem.sku,
      faultDescription: data.faultDescription,
      reportedBy,
      status: 'reported',
      type: inventoryItem.type,
      resolution: '',
    }], { session });
    asset.preRmaStatus = asset.status;
    asset.status = 'rma';
    asset.activeRmaCaseId = rmaCase._id;
    await asset.save({ session });
    await Activity.create([{
      type: 'return', title: 'RMA Case Created',
      description: `RMA ${rmaId} filed for ${asset.serialNumber}: ${data.faultDescription}`,
      actionLabel: 'View RMA',
    }], { session });
    return rmaCase;
  });
};

/**
 * Updates an RMA case status with transition validation.
 * Valid transitions: reported → under-review → sent-to-supplier → replacement-pending → resolved → closed
 */
exports.updateRmaCase = async (id, data, user) => {
  assertRole(user, ['INVENTORY']);

  if (['sent-to-supplier', 'replacement-pending'].includes(data.status) && data.replacementSerialNumber) {
    return exports.receiveRmaReplacement(id, data, user);
  }

  return mongoose.connection.transaction(async (session) => {
    const rmaCase = await RmaCase.findOne({ rmaId: id }).session(session);
    if (!rmaCase) throw serviceError('RMA case not found', 404, 'RMA_NOT_FOUND');
    if (data.status && data.status !== rmaCase.status) {
      assertRmaTransition(rmaCase.status, data.status, data);
      rmaCase.status = data.status;
      if (data.status === 'resolved' || data.status === 'closed') {
        rmaCase.resolvedAt = rmaCase.resolvedAt || new Date();
      }
    }
    if (data.resolutionType !== undefined) rmaCase.resolutionType = data.resolutionType;
    if (data.resolutionNote !== undefined) rmaCase.resolutionNote = data.resolutionNote;
    if (data.resolution !== undefined) rmaCase.resolution = data.resolution;
    await rmaCase.save({ session });

    const asset = rmaCase.serializedAssetId
      ? await SerializedAsset.findById(rmaCase.serializedAssetId).session(session)
      : await SerializedAsset.findOne({ normalizedSerial: normalizeSerialNumber(rmaCase.serialNumber) }).session(session);

    if (asset) {
      if (data.status === 'sent-to-supplier') {
        asset.status = 'returned-to-supplier';
        await asset.save({ session });
        if (asset.quarantineId) {
          await QuarantineItem.findByIdAndUpdate(asset.quarantineId, { status: 'returned-to-supplier' }).session(session);
        }
      } else if (['resolved', 'closed'].includes(rmaCase.status)) {
        if (asset.status === 'rma' && String(asset.activeRmaCaseId || '') === String(rmaCase._id)) {
          asset.status = asset.preRmaStatus === 'quarantined' ? 'quarantined' : 'available';
          asset.activeRmaCaseId = undefined;
          asset.preRmaStatus = undefined;
          await asset.save({ session });
        }
      }
    }

    await Activity.create([{
      type: 'return', title: 'RMA Status Updated',
      description: `RMA ${rmaCase.rmaId} status changed to ${rmaCase.status}`,
      actionLabel: 'View RMA',
    }], { session });
    return rmaCase;
  });
};

/**
 * Receives a supplier replacement for an RMA case.
 * Retires original asset, links replacement lineage, creates new available SerializedAsset,
 * and advances RMA to resolved.
 */
exports.receiveRmaReplacement = async (id, data, user) => {
  assertRole(user, ['INVENTORY']);
  const rawSerial = data.serialNumber || data.replacementSerialNumber;
  const serialNumber = assertReplacementSerial(rawSerial);
  const normalizedSerial = normalizeSerialNumber(serialNumber);

  return mongoose.connection.transaction(async (session) => {
    const rmaCase = await RmaCase.findOne({ rmaId: id }).session(session);
    if (!rmaCase) throw serviceError('RMA case not found', 404, 'RMA_NOT_FOUND');
    if (!['sent-to-supplier', 'replacement-pending'].includes(rmaCase.status)) {
      throw serviceError(`Cannot receive replacement for RMA in status '${rmaCase.status}'`, 409, 'INVALID_RMA_STATUS');
    }

    if (await SerializedAsset.exists({ normalizedSerial }).session(session)) {
      throw serviceError('Replacement serial number already exists in inventory', 409, 'DUPLICATE_SERIAL');
    }

    const originalAsset = rmaCase.serializedAssetId
      ? await SerializedAsset.findById(rmaCase.serializedAssetId).session(session)
      : await SerializedAsset.findOne({ normalizedSerial: normalizeSerialNumber(rmaCase.serialNumber) }).session(session);

    if (!originalAsset) throw serviceError('Original serialized asset record not found', 404, 'ASSET_NOT_FOUND');

    const [replacementAsset] = await SerializedAsset.create([{
      inventoryId: originalAsset.inventoryId,
      serialNumber,
      normalizedSerial,
      status: 'available',
      replacementForAssetId: originalAsset._id,
      supplierId: originalAsset.supplierId,
      location: data.location || originalAsset.location || '',
      binLocation: data.binLocation || originalAsset.binLocation || '',
      origin: 'receipt',
    }], { session });

    originalAsset.status = 'retired';
    originalAsset.retiredAt = new Date();
    originalAsset.replacedByAssetId = replacementAsset._id;
    originalAsset.activeRmaCaseId = undefined;
    await originalAsset.save({ session });

    rmaCase.status = 'resolved';
    rmaCase.resolutionType = 'supplier-replacement';
    rmaCase.resolutionNote = data.notes || data.resolution || `Supplier replacement with serial ${serialNumber}`;
    rmaCase.resolution = rmaCase.resolutionNote;
    rmaCase.resolvedAt = new Date();
    rmaCase.replacementSerializedAssetId = replacementAsset._id;
    await rmaCase.save({ session });

    await Activity.create([{
      type: 'return',
      title: 'RMA Supplier Replacement Received',
      description: `RMA ${rmaCase.rmaId}: Serial ${originalAsset.serialNumber} retired and replaced by ${replacementAsset.serialNumber}`,
      actionLabel: 'View Asset',
    }], { session });

    return {
      rmaCase,
      replacementAsset,
      originalAsset,
    };
  });
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
