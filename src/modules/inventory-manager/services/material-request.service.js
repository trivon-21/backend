const mongoose = require('mongoose');
const Inventory = require('../../../models/Inventory');
const WarehousePickRequest = require('../../../models/WarehousePickRequest');
const JobMaterialRequest = require('../../../models/JobMaterialRequest');
const Activity = require('../../../models/Activity');
const TechTeam = require('../../shared/tech-teams/techTeam.model');
const materialWorkflow = require('../../shared/jobMaterialRequest/jobMaterialRequest.service');
const { legacyStockStatus } = require('../../../utils/inventory-domain');
const { serviceError, assertRole, actorName } = require('./shared');

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
      .select('name description sku available reserved unit unitCost itemClass subcategory supplierId manufacturerPartNumber')
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
    returnDocument: 'after',
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
        { returnDocument: 'after', runValidators: true, session },
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
        { returnDocument: 'after', runValidators: true, session },
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
        { returnDocument: 'after', runValidators: true, session },
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
