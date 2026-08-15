const Inventory = require('../../models/Inventory');
const Activity = require('../../models/Activity');
const Logistics = require('../../models/Logistics');
const Supplier = require('../../models/Supplier');
const Procurement = require('../../models/Procurement');
const Order = require('../../models/Order');
const MaterialRequest = require('../../models/MaterialRequest');
const AssetLoan = require('../../models/AssetLoan');
const AssetReturnLog = require('../../models/AssetReturnLog');
const OrderRequest = require('../../models/OrderRequest');
const LeftoverReturn = require('../../models/LeftoverReturn');
const RmaCase = require('../../models/RmaCase');
const QuarantineItem = require('../../models/QuarantineItem');
const mongoose = require('mongoose');
const {
  deriveStockStatus,
  legacyStockStatus,
  isLowStock,
  normalizeStringList,
  suggestedOrderQuantity
} = require('../../utils/inventory-domain');

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

function synchronizeStatusForResponse(item) {
  if (item) item.status = legacyStockStatus(item.available, item.reorderLevel);
  return item;
}

/**
 * Retrieves aggregated dashboard data including inventory stats, recent activity, and logistics status.
 */
exports.getDashboardData = async (user) => {
  const inventory = await Inventory.find();
  const activities = await Activity.find({ 
    type: { $in: ['return', 'dispatch', 'request', 'grn', 'alert'] } 
  }).sort({ timestamp: -1 }).limit(10);
  const logistics = await Logistics.find();

  const orders = await Order.find();
  const loans = await AssetLoan.find();
  const materialRequests = await MaterialRequest.find();

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
        { label: 'Overdue Returns', value: loans.filter(l => new Date(l.dueDate) < new Date() && !l.returnDate).length }
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
    logistics: logistics.map(l => ({
      label: l.label,
      current: l.current,
      total: l.total,
      subLabel: l.subLabel
    }))
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
  const item = await Inventory.findById(id).populate('supplierId', 'name');
  return synchronizeStatusForResponse(item);
};

/**
 * Updates an existing inventory item.
 */
exports.updateInventoryItem = async (id, data) => {
  const existing = await Inventory.findById(id);
  if (!existing) return null;

  const update = normalizeInventoryData(data, false);
  if (update.serialNumbers) {
    if (update.serialNumbers.length !== (Array.isArray(data.serialNumbers) ? data.serialNumbers.length : update.serialNumbers.length)) {
      throw serviceError('Serial numbers must be unique', 409, 'DUPLICATE_SERIAL');
    }
    if (await Inventory.exists({ _id: { $ne: id }, serialNumbers: { $in: update.serialNumbers } })) {
      throw serviceError('One or more serial numbers already exist in inventory', 409, 'DUPLICATE_SERIAL');
    }
  }
  const available = update.available ?? existing.available;
  const reorderLevel = update.reorderLevel ?? existing.reorderLevel;
  update.status = legacyStockStatus(available, reorderLevel);

  return await Inventory.findByIdAndUpdate(id, update, { new: true, runValidators: true })
    .populate('supplierId', 'name');
};

/**
 * Creates a new inventory item and calculates its initial stock status.
 * Automatically generates a GRN (Goods Received Note) and activity log if supplier info is provided.
 */
exports.createInventoryItem = async (data, user) => {
  const normalizedData = normalizeInventoryData(data);
  const available = Number(normalizedData.available) || 0;
  const reorderLevel = normalizedData.reorderLevel == null ? 10 : Number(normalizedData.reorderLevel) || 0;
  const status = legacyStockStatus(available, reorderLevel);
  const submittedSerials = Array.isArray(data.serialNumbers) ? data.serialNumbers : [];
  if (normalizedData.serialNumbers?.length !== submittedSerials.length) {
    throw serviceError('Serial numbers must be unique', 409, 'DUPLICATE_SERIAL');
  }
  if (normalizedData.serialNumbers?.length && await Inventory.exists({ serialNumbers: { $in: normalizedData.serialNumbers } })) {
    throw serviceError('One or more serial numbers already exist in inventory', 409, 'DUPLICATE_SERIAL');
  }
  if (normalizedData.isSerialized && available > 0 && normalizedData.serialNumbers?.length !== available) {
    throw serviceError('Serialized items require one serial number per available unit', 400, 'SERIAL_COUNT_MISMATCH');
  }

  const newItem = new Inventory({
    ...normalizedData,
    status
  });

  const savedItem = await newItem.save();

  // Create procurement record for incoming stock
  if (normalizedData.supplierName && normalizedData.invoiceNumber) {
    const procurement = new Procurement({
      inventoryId: savedItem._id,
      invoiceNumber: normalizedData.invoiceNumber,
      supplierId: normalizedData.supplierId,
      supplierName: normalizedData.supplierName,
      itemName: normalizedData.name,
      sku: normalizedData.sku,
      itemClass: normalizedData.itemClass,
      subcategory: normalizedData.subcategory,
      brand: normalizedData.brand,
      quantity: available,
      unit: normalizedData.unit || 'units',
      unitCost: normalizedData.unitCost || 0,
      totalCost: available * (normalizedData.unitCost || 0),
      binLocation: normalizedData.binLocation || '',
      receivedBy: user ? user.fullName : 'Inventory Manager'
    });
    await procurement.save();

    // Log the Goods Received activity
    const activity = new Activity({
      type: 'grn',
      title: 'Goods Received',
      description: `Received ${available} ${normalizedData.unit || 'units'} of ${normalizedData.name} from ${normalizedData.supplierName}`,
      actionLabel: 'View GRN'
    });
    await activity.save();
  }

  return savedItem;
};

/**
 * Receives stock against an existing item or creates a newly classified item.
 */
exports.receiveInventory = async (data, user) => {
  const quantity = Number(data.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw serviceError('Receipt quantity must be a positive whole number', 400, 'INVALID_QUANTITY');
  }
  if (!data.invoiceNumber || !data.supplierId) {
    throw serviceError('Supplier and invoice number are required', 400, 'INVALID_RECEIPT');
  }
  if (!mongoose.isValidObjectId(data.supplierId)) {
    throw serviceError('Supplier not found', 404, 'SUPPLIER_NOT_FOUND');
  }

  const supplier = await Supplier.findById(data.supplierId);
  if (!supplier) throw serviceError('Supplier not found', 404, 'SUPPLIER_NOT_FOUND');

  const submittedSerials = Array.isArray(data.serialNumbers) ? data.serialNumbers : [];
  const serialNumbers = normalizeStringList(submittedSerials);
  if (serialNumbers.length !== submittedSerials.length) {
    throw serviceError('Serial numbers must be unique within the receipt', 409, 'DUPLICATE_SERIAL');
  }
  if (serialNumbers.length && await Inventory.exists({ serialNumbers: { $in: serialNumbers } })) {
    throw serviceError('One or more serial numbers already exist in inventory', 409, 'DUPLICATE_SERIAL');
  }

  let item;
  if (data.inventoryId) {
    if (!mongoose.isValidObjectId(data.inventoryId)) {
      throw serviceError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
    }
    item = await Inventory.findById(data.inventoryId);
    if (!item) throw serviceError('Inventory item not found', 404, 'ITEM_NOT_FOUND');
    if (item.isSerialized && serialNumbers.length !== quantity) {
      throw serviceError('Serialized items require one serial number per received unit', 400, 'SERIAL_COUNT_MISMATCH');
    }
    if (!item.isSerialized && serialNumbers.length) {
      throw serviceError('Serial numbers are only allowed for serialized items', 400, 'UNEXPECTED_SERIALS');
    }
    item.available += quantity;
    item.serialNumbers.push(...serialNumbers);
    item.supplierId = supplier._id;
    if (data.location) item.location = data.location;
    if (data.binLocation !== undefined) item.binLocation = data.binLocation;
    if (data.unitCost !== undefined) item.unitCost = Number(data.unitCost) || 0;
    item.status = legacyStockStatus(item.available, item.reorderLevel);
    await item.save();
  } else {
    const itemData = normalizeInventoryData({
      ...(data.item || {}),
      available: quantity,
      supplierId: supplier._id,
      serialNumbers
    });
    if (!itemData.name || !itemData.sku || !itemData.brand) {
      throw serviceError('Name, SKU and brand are required for a new item', 400, 'INVALID_ITEM');
    }
    if (itemData.isSerialized && serialNumbers.length !== quantity) {
      throw serviceError('Serialized items require one serial number per received unit', 400, 'SERIAL_COUNT_MISMATCH');
    }
    if (!itemData.isSerialized && serialNumbers.length) {
      throw serviceError('Serial numbers are only allowed for serialized items', 400, 'UNEXPECTED_SERIALS');
    }
    itemData.status = legacyStockStatus(itemData.available, itemData.reorderLevel);
    try {
      item = await new Inventory(itemData).save();
    } catch (error) {
      if (error.code === 11000) throw serviceError('SKU already exists', 409, 'DUPLICATE_SKU');
      throw error;
    }
  }

  const receiptUnitCost = Number(data.unitCost ?? item.unitCost) || 0;
  const procurement = await new Procurement({
    inventoryId: item._id,
    invoiceNumber: data.invoiceNumber,
    poNumber: data.poNumber || '',
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
    receivedBy: user?.fullName || 'Inventory Manager',
    receivedDate: data.receivedDate || new Date(),
    condition: data.condition || 'Good'
  }).save();

  await new Activity({
    type: 'grn',
    title: 'Goods Received',
    description: `Received ${quantity} ${item.unit} of ${item.name} from ${supplier.name}`,
    actionLabel: 'View GRN'
  }).save();

  return { item: await item.populate('supplierId', 'name'), procurement };
};

/**
 * Fetches the most recent procurement records.
 */
exports.getRecentProcurements = async () => {
  return await Procurement.find()
    .populate('inventoryId', 'name sku')
    .populate('supplierId', 'name')
    .sort({ timestamp: -1 })
    .limit(10);
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
  const newSupplier = new Supplier({ name });
  return await newSupplier.save();
};

/**
 * Retrieves all orders sorted by creation date.
 */
exports.getOrders = async () => {
  return await Order.find().sort({ createdAt: -1 });
};

/**
 * Updates an order's details and manages status-related timestamps.
 */
exports.updateOrder = async (id, data) => {
  if (data.lastMovedAt === null) {
    const { lastMovedAt, completedAt, ...restData } = data;
    return await Order.findOneAndUpdate({ orderId: id }, { $unset: { lastMovedAt: 1, completedAt: 1 }, $set: restData }, { new: true });
  }
  return await Order.findOneAndUpdate({ orderId: id }, data, { new: true });
};

/**
 * Fetches all material requests sorted by creation date.
 */
exports.getMaterialRequests = async () => {
  return await MaterialRequest.find().sort({ createdAt: -1 });
};

/**
 * Updates a material request and handles state transition resets.
 */
exports.updateMaterialRequest = async (id, data) => {
  if (data.lastMovedAt === null) {
    const { lastMovedAt, completedAt, ...restData } = data;
    return await MaterialRequest.findOneAndUpdate({ requestId: id }, { $unset: { lastMovedAt: 1, completedAt: 1 }, $set: restData }, { new: true });
  }
  return await MaterialRequest.findOneAndUpdate({ requestId: id }, data, { new: true });
};

/**
 * Retrieves technician members from the primary Dassana database.
 */
exports.getTechnicians = async () => {
  const dassanaDb = mongoose.connection.useDb('Dassana');
  return await dassanaDb.collection('TechTeamMembers').find({}).toArray();
};

/**
 * Fetches all active asset loans.
 */
exports.getAssetLoans = async () => {
  return await AssetLoan.find().sort({ checkedOutAt: -1 });
};

/**
 * Returns serialized HVAC tools with asset tags that are not currently on loan.
 */
exports.getAvailableTools = async () => {
  const [tools, activeLoans] = await Promise.all([
    Inventory.find({ itemClass: 'Tools and Test Equipment', isSerialized: true })
      .select('name sku itemClass subcategory brand serialNumbers location binLocation'),
    AssetLoan.find().select('assetTag')
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
exports.checkOutTool = async (data) => {
  const tool = await Inventory.findOne({
    _id: data.toolId,
    itemClass: 'Tools and Test Equipment',
    isSerialized: true,
    serialNumbers: data.assetTag
  });
  if (!tool) throw serviceError('Serialized tool or asset tag not found', 404, 'TOOL_NOT_FOUND');
  const existingLoan = await AssetLoan.findOne({ assetTag: data.assetTag });
  if (existingLoan) throw serviceError('This asset tag is already checked out', 409, 'ASSET_ALREADY_LOANED');

  const newLoan = new AssetLoan(data);
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
    description: `${data.technicianName} checked out ${data.toolName} (${data.assetTag})`,
    actionLabel: 'View Asset'
  });
  await activity.save();

  return savedLoan;
};

/**
 * Processes a tool return, archiving the loan and logging the return event.
 */
exports.returnTool = async (loanId) => {
  const loan = await AssetLoan.findById(loanId);
  if (!loan) throw new Error('Loan not found');

  const returnLog = new AssetReturnLog({
    toolName: loan.toolName,
    assetTag: loan.assetTag,
    technicianName: loan.technicianName,
    checkedOutAt: loan.checkedOutAt,
    returnedAt: new Date()
  });

  await returnLog.save();

  const activity = new Activity({
    type: 'return',
    title: 'Tool Returned',
    description: `${loan.technicianName} returned ${loan.toolName} (${loan.assetTag})`,
    actionLabel: 'View Log'
  });
  await activity.save();

  return await AssetLoan.findByIdAndDelete(loanId);
};

/**
 * Retrieves all historical asset return logs.
 */
exports.getAssetReturnLogs = async () => {
  return await AssetReturnLog.find().sort({ returnedAt: -1 });
};

// ── Order Creation Methods ──

/**
 * Fetches all purchase order requests.
 */
exports.getOrderRequests = async () => {
  return await OrderRequest.find().populate('items.supplierId', 'name').sort({ createdAt: -1 });
};

/**
 * Creates a new purchase order request with auto-generated ID and total estimates.
 */
exports.createOrderRequest = async (data, user) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const requestId = `ORD-${year}${month}${day}-${hours}${minutes}${seconds}`;

  const items = (data.items || []).map(item => ({
    ...item,
    estimatedTotal: (item.quantity || 0) * (item.unitCost || 0)
  }));
  const totalEstimate = items.reduce((sum, item) => sum + item.estimatedTotal, 0);

  const newRequest = new OrderRequest({
    requestId,
    items,
    supplierName: data.supplierName,
    totalEstimate,
    status: data.status || 'draft',
    requestedBy: user?.fullName || 'Inventory Manager',
    priority: data.priority || 'normal',
    notes: data.notes || '',
    source: data.source || 'manual'
  });

  const saved = await newRequest.save();

  const activity = new Activity({
    type: 'request',
    title: 'Order Request Created',
    description: `New purchase order ${requestId} submitted for ${data.supplierName} (${items.length} items)`,
    actionLabel: 'View Order'
  });
  await activity.save();

  return saved;
};

/**
 * Updates an existing purchase order request.
 */
exports.updateOrderRequest = async (id, data) => {
  const request = await OrderRequest.findOne({ requestId: id });
  if (!request) throw new Error('Order request not found');

  if (data.items) {
    data.items = data.items.map(item => ({
      ...item,
      estimatedTotal: (item.quantity || 0) * (item.unitCost || 0)
    }));
    data.totalEstimate = data.items.reduce((sum, item) => sum + item.estimatedTotal, 0);
  }

  return await OrderRequest.findOneAndUpdate(
    { requestId: id },
    { $set: data },
    { new: true }
  );
};

/**
 * Approves a purchase order request and auto-generates procurement records.
 */
exports.approveOrderRequest = async (id, user) => {
  const request = await OrderRequest.findOne({ requestId: id });
  if (!request) throw new Error('Order request not found');

  request.status = 'approved';
  request.approvedBy = user?.fullName || 'Finance Officer';
  request.approvedAt = new Date();
  await request.save();

  const activity = new Activity({
    type: 'request',
    title: 'Order Approved',
    description: `Purchase order ${request.requestId} approved by ${request.approvedBy}; goods receipt is still pending.`,
    actionLabel: 'View Order'
  });
  await activity.save();

  return request;
};

/**
 * Rejects a purchase order request with a specified reason.
 */
exports.rejectOrderRequest = async (id, reason, user) => {
  const request = await OrderRequest.findOne({ requestId: id });
  if (!request) throw new Error('Order request not found');

  request.status = 'rejected';
  request.rejectionReason = reason || 'No reason provided';
  request.rejectedAt = new Date();
  await request.save();

  const activity = new Activity({
    type: 'alert',
    title: 'Order Rejected',
    description: `Purchase order ${request.requestId} was rejected.`,
    actionLabel: 'View Order'
  });
  await activity.save();

  return request;
};

/**
 * Retrieves items that require restocking based on their low-stock status.
 */
exports.getSuggestedOrders = async () => {
  const items = await Inventory.find({
    $expr: {
      $lte: [
        { $ifNull: ['$available', 0] },
        { $ifNull: ['$reorderLevel', 10] }
      ]
    }
  })
    .populate('supplierId', 'name')
    .sort({ available: 1 })
    .select('name sku available reserved reorderLevel maxStockLevel unitCost unit status category itemClass subcategory brand manufacturerPartNumber compatibleModels supplierId');
  return items.map((item) => ({
    ...item.toObject({ virtuals: true }),
    status: legacyStockStatus(item.available, item.reorderLevel),
    stockStatus: deriveStockStatus(item.available, item.reorderLevel),
    suggestedQuantity: suggestedOrderQuantity(item.available, item.maxStockLevel, item.reorderLevel)
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
  return `${prefix}-${year}${month}${day}-${hours}${minutes}${seconds}`;
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
  const returnId = generateId('LR');
  const returnedBy = user?.fullName || 'Inventory Manager';

  const leftoverReturn = new LeftoverReturn({
    returnId,
    jobId: data.jobId,
    itemId: data.itemId || null,
    itemName: data.itemName,
    itemSku: data.itemSku || '',
    quantityReturned: data.quantityReturned,
    condition: data.condition,
    returnedBy,
    notes: data.notes || '',
    restoredToStock: false,
    movedToQuarantine: false,
  });

  // Business logic: update stock or quarantine based on condition
  if (data.condition === 'good') {
    // Restore to inventory
    if (data.itemId) {
      const item = await Inventory.findById(data.itemId);
      if (item) {
        item.available = (item.available || 0) + data.quantityReturned;
        item.status = legacyStockStatus(item.available, item.reorderLevel);
        await item.save();
      }
    }
    leftoverReturn.restoredToStock = true;
  } else {
    // Damaged or scrap → move to quarantine
    const quarantineId = generateId('QZ');
    const quarantineItem = new QuarantineItem({
      quarantineId,
      itemName: data.itemName,
      quantity: data.quantityReturned,
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
    description: `${data.quantityReturned} ${data.unit || 'units'} of ${data.itemName} returned from job ${data.jobId} (${data.condition})`,
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
  const rmaId = generateId('RMA');
  const reportedBy = user?.fullName || 'Inventory Manager';
  const inventoryItem = await Inventory.findOne({ serialNumbers: data.serialNumber });
  if (!inventoryItem) throw serviceError('Serial number was not found in inventory', 404, 'SERIAL_NOT_FOUND');

  const rmaCase = new RmaCase({
    rmaId,
    inventoryId: inventoryItem._id,
    serialNumber: data.serialNumber,
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
exports.updateRmaCase = async (id, data) => {
  const rmaCase = await RmaCase.findOne({ rmaId: id });
  if (!rmaCase) throw new Error('RMA case not found');

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
  const quarantineId = generateId('QZ');

  const quarantineItem = new QuarantineItem({
    quarantineId,
    itemName: data.itemName,
    quantity: data.quantity,
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
    description: `${data.quantity} ${data.unit || 'units'} of ${data.itemName} added to quarantine: ${data.reason}`,
    actionLabel: 'View Quarantine',
  });
  await activity.save();

  return saved;
};

/**
 * Disposes a quarantine item — updates status and records audit trail.
 */
exports.disposeQuarantineItem = async (id, user) => {
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
