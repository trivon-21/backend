const mongoose = require('mongoose');
const Inventory = require('../../../models/Inventory');
const Supplier = require('../../../models/Supplier');
const Procurement = require('../../../models/Procurement');
const PurchaseRequest = require('../../../models/PurchaseRequest');
const ReceiptAuthorization = require('../../../models/ReceiptAuthorization');
const ReceiptDiscrepancy = require('../../../models/ReceiptDiscrepancy');
const QuarantineItem = require('../../../models/QuarantineItem');
const SerializedAsset = require('../../../models/SerializedAsset');
const Activity = require('../../../models/Activity');
const {
  legacyStockStatus,
  isValidInventoryLocation,
  normalizeStringList,
} = require('../../../utils/inventory-domain');
const {
  canonicalPurchaseStatus,
  outstandingQuantity,
  fulfillmentStatus,
  NON_PO_REASONS,
  receiptAuthorizationWorkflowStages,
} = require('../../../utils/purchase-workflow');
const {
  nextDiscrepancyState,
  normalizeReceiptDisposition,
  receiptProgress,
} = require('../receipt-disposition');
const { normalizeSerialNumber } = require('../../../utils/serialized-asset-domain');
const {
  serviceError,
  assertRole,
  actorName,
  assertObjectId,
  validHttpUrl,
  generateReference,
  orderLookup,
  authorizationLookup,
  discrepancyLookup,
  runInTransaction,
  affectedWorkExists,
  normalizeInventoryData,
  validateCatalogData,
  projectSerialNumbers,
} = require('./shared');

exports.createReceiptAuthorization = async (data, user, options = {}) => {
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
    return await runInTransaction(async (session) => {
      const sessionOpt = session ? { session } : {};
      const [authorization] = await ReceiptAuthorization.create([{
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
      }], sessionOpt);

      await Activity.create([{
        type: 'request', title: 'Non-PO Authorization Requested',
        description: `${authorization.authorizationNumber} submitted to Manager`, actionLabel: 'View Authorization',
      }], sessionOpt);

      return authorization.populate(['inventoryId', { path: 'supplierId', select: 'name' }]);
    }, options.session);
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
