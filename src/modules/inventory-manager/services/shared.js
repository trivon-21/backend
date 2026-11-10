const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const Inventory = require('../../../models/Inventory');
const Supplier = require('../../../models/Supplier');
const InspectionTicket = require('../../../models/InspectionTicket');
const Installation = require('../../../models/Installation');
const ServiceTicket = require('../../../models/ServiceTicket');
const SerializedAsset = require('../../../models/SerializedAsset');
const {
  legacyStockStatus,
  isValidClassification,
  isValidInventoryLocation,
  normalizeStringList,
} = require('../../../utils/inventory-domain');
const { runInTransaction } = require('../../../utils/transaction');

const MASTER_DATA_FIELDS = [
  'name', 'description', 'itemClass', 'subcategory', 'brand', 'manufacturerPartNumber', 'type', 'unit',
  'reorderLevel', 'maxStockLevel', 'unitCost', 'location', 'binLocation', 'supplierId',
  'isSerialized', 'compatibleModels', 'systemType', 'refrigerants', 'capacityBtu',
  'voltage', 'phase', 'specsUrl',
];

const PROTECTED_STOCK_FIELDS = ['available', 'reserved', 'serialNumbers', 'status', 'category'];
const TECHNICIAN_ROLES = ['MAIN_TECH', 'SERVICE_TEAM', 'INSPECTION'];

function normalizeInventoryData(data, applyDefaults = true) {
  const normalized = { ...data };
  if (!normalized.itemClass && applyDefaults) normalized.itemClass = 'Unclassified';
  if (!normalized.subcategory && applyDefaults) normalized.subcategory = 'Unclassified';
  if (normalized.itemClass) normalized.category = normalized.itemClass;
  else delete normalized.category;
  if (normalized.supplierId === '') delete normalized.supplierId;
  if (normalized.description !== undefined) normalized.description = String(normalized.description).trim();
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

function generateId(prefix) {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${year}${month}${day}-${random}`;
}

function assertRequestVersion(request, version) {
  if (version !== undefined && Number(version) !== Number(request.statusVersion)) {
    throw serviceError('The material request changed; reload before trying again', 409, 'STALE_MATERIAL_REQUEST');
  }
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
    throw serviceError('Select a valid warehouse, rack and bin', 400, 'INVALID_STORAGE_LOCATION');
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

module.exports = {
  MASTER_DATA_FIELDS,
  PROTECTED_STOCK_FIELDS,
  TECHNICIAN_ROLES,
  normalizeInventoryData,
  serviceError,
  assertRole,
  actorName,
  assertObjectId,
  pickFields,
  validHttpUrl,
  generateReference,
  generateId,
  assertRequestVersion,
  orderLookup,
  authorizationLookup,
  discrepancyLookup,
  runInTransaction,
  affectedWorkExists,
  controllerSafeOrderFields,
  pickMasterData,
  validateCatalogData,
  rejectProtectedStockFields,
  projectSerialNumbers,
};
