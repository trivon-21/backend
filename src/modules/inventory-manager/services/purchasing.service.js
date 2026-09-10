const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const Inventory = require('../../../models/Inventory');
const Supplier = require('../../../models/Supplier');
const PurchaseRequest = require('../../../models/PurchaseRequest');
const WarehousePickRequest = require('../../../models/WarehousePickRequest');
const Activity = require('../../../models/Activity');
const {
  canonicalPurchaseStatus,
  purchaseRequestWorkflowStages,
} = require('../../../utils/purchase-workflow');
const {
  assertPurchaseStatusVersion,
  savePurchaseRequest,
} = require('../../../utils/purchase-request-concurrency');
const {
  serviceError,
  assertRole,
  actorName,
  assertObjectId,
  generateReference,
  orderLookup,
  runInTransaction,
  controllerSafeOrderFields,
} = require('./shared');
const {
  inventoryCache,
  invalidateInventoryScopes,
  INVENTORY_CACHE_PREFIXES,
} = require('../inventory-manager.cache');

// Purchase-request writes never move stock — receiving does. So they only clear
// procurement, the dashboard tiles and the activity feed.
const invalidatePurchasingScopes = () => invalidateInventoryScopes(
  INVENTORY_CACHE_PREFIXES.PROCUREMENT,
  INVENTORY_CACHE_PREFIXES.DASHBOARD,
  INVENTORY_CACHE_PREFIXES.ACTIVITY,
);

/** Shared with the bundled procurement summary so both paths return one shape. */
const loadOrderRequests = async () => {
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
exports.loadOrderRequests = loadOrderRequests;

exports.getOrderRequests = async (user) => {
  assertRole(user, ['INVENTORY']);
  return await inventoryCache.get(
    `${INVENTORY_CACHE_PREFIXES.PROCUREMENT}order-requests`,
    loadOrderRequests,
  );
};

/**
 * Creates a new purchase order request with auto-generated ID and total estimates.
 */
exports.createOrderRequest = async (data, user, options = {}) => {
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
  const result = await runInTransaction(async (session) => {
    const sessionOpt = session ? { session } : {};
    if (safe.source === 'material-request') {
      assertObjectId(safe.sourceMaterialRequestId, 'Material request reference is invalid', 'INVALID_MATERIAL_REQUEST_ID');
      const materialRequest = await WarehousePickRequest.findOne({
        $or: [{ _id: safe.sourceMaterialRequestId }, { sourceMaterialRequestId: safe.sourceMaterialRequestId }],
        status: 'pending',
      }).session(session || null);
      if (!materialRequest) {
        throw serviceError('A pending warehouse request is required for a shortage order', 409, 'MATERIAL_REQUEST_NOT_PENDING');
      }
      const duplicate = await PurchaseRequest.exists({
        source: 'material-request',
        sourceMaterialRequestId: materialRequest.sourceMaterialRequestId,
        supplierId: supplierId || null,
        status: { $nin: ['rejected', 'received'] },
      }).session(session || null);
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

    const saved = await newRequest.save(sessionOpt);

    await Activity.create([{
      type: 'request',
      title: 'Order Request Created',
      description: `Draft purchase request ${requestId} created for ${safe.supplierName} (${items.length} items)`,
      actionLabel: 'View Order',
    }], sessionOpt);

    return saved;
  }, options.session);
  invalidatePurchasingScopes();
  return result;
};

/**
 * Updates an existing purchase order request.
 */
exports.updateOrderRequest = async (id, data, user) => {
  assertRole(user, ['INVENTORY']);
  const request = await PurchaseRequest.findOne({ requestId: id });
  if (!request) throw serviceError('Order request not found', 404, 'ORDER_NOT_FOUND');
  if (request.requestedById && user?.role !== 'SUPER_ADMIN' && String(request.requestedById) !== String(user._id)) {
    throw serviceError('Only the requester can edit this purchase request', 403, 'NOT_REQUEST_OWNER');
  }
  if (!request.requestedById) {
    request.requestedById = user._id;
    request.requestedBy = request.requestedBy || actorName(user, 'Inventory Manager');
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
  const updated = await savePurchaseRequest(request);
  invalidatePurchasingScopes();
  return updated;
};

exports.submitOrderRequest = async (id, data, user, options = {}) => {
  assertRole(user, ['INVENTORY']);
  const result = await runInTransaction(async (session) => {
    const sessionOpt = session ? { session } : {};
    const request = await PurchaseRequest.findOne(orderLookup(id)).session(session || null);
    if (!request) throw serviceError('Order request not found', 404, 'ORDER_NOT_FOUND');
    if (request.requestedById && user?.role !== 'SUPER_ADMIN' && String(request.requestedById) !== String(user._id)) {
      throw serviceError('Only the requester can submit this purchase request', 403, 'NOT_REQUEST_OWNER');
    }
    if (!request.requestedById) {
      request.requestedById = user._id;
      request.requestedBy = request.requestedBy || actorName(user, 'Inventory Manager');
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
    await savePurchaseRequest(request, sessionOpt);
    await Activity.create([{
      type: 'request', title: 'Purchase Request Submitted',
      description: `${request.requestId} submitted to Manager for operational approval`, actionLabel: 'View Request',
    }], sessionOpt);
    return request;
  }, options.session);
  invalidatePurchasingScopes();
  return result;
};

exports.issuePurchaseOrder = async (id, data, user, options = {}) => {
  assertRole(user, ['INVENTORY']);
  const result = await runInTransaction(async (session) => {
    const sessionOpt = session ? { session } : {};
    const request = await PurchaseRequest.findOne(orderLookup(id)).session(session || null);
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
    await savePurchaseRequest(request, sessionOpt);
    await Activity.create([{
      type: 'request', title: 'Purchase Order Issued',
      description: `${request.poNumber} issued from ${request.requestId}`, actionLabel: 'Receive Stock',
    }], sessionOpt);
    return request;
  }, options.session);
  invalidatePurchasingScopes();
  return result;
};

exports.retiredInventoryApproval = () => {
  throw serviceError('Inventory approval was retired; submit the request to Manager Approvals', 410, 'APPROVAL_MOVED_TO_MANAGER');
};
