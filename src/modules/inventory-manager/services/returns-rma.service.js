const mongoose = require('mongoose');
const Inventory = require('../../../models/Inventory');
const LeftoverReturn = require('../../../models/LeftoverReturn');
const WarehousePickRequest = require('../../../models/WarehousePickRequest');
const QuarantineItem = require('../../../models/QuarantineItem');
const SerializedAsset = require('../../../models/SerializedAsset');
const RmaCase = require('../../../models/RmaCase');
const Activity = require('../../../models/Activity');
const { legacyStockStatus } = require('../../../utils/inventory-domain');
const { normalizeSerialNumber } = require('../../../utils/serialized-asset-domain');
const { assertRmaTransition, assertReplacementSerial } = require('../../../utils/rma-workflow');
const {
  serviceError,
  assertRole,
  generateId,
  assertRequestVersion,
} = require('./shared');

/**
 * Fetches all leftover return records sorted by newest first.
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
