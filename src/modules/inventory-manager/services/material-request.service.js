const mongoose = require('mongoose');
const Inventory = require('../../../models/Inventory');
const WarehousePickRequest = require('../../../models/WarehousePickRequest');
const JobMaterialRequest = require('../../../models/JobMaterialRequest');
const Activity = require('../../../models/Activity');
const TechTeam = require('../../shared/tech-teams/techTeam.model');
const materialWorkflow = require('../../shared/jobMaterialRequest/jobMaterialRequest.service');
const {
  aggregateReservationLines,
  computeKitShortages,
  STOCK_STATUS_PIPELINE_EXPR,
} = require('../../../utils/inventory-domain');
const { serviceError, assertRole, actorName, assertRequestVersion, runInTransaction } = require('./shared');
const {
  inventoryCache,
  invalidateInventoryCache,
  INVENTORY_CACHE_PREFIXES,
} = require('../inventory-manager.cache');

/**
 * Fetches all material requests sorted by creation date.
 */
exports.getMaterialRequests = async () => {
  return await inventoryCache.get(`${INVENTORY_CACHE_PREFIXES.MATERIAL_REQUEST}list`, async () => {
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
          // The SKU always belongs to the catalog item, not the request line;
          // fetch it live from Inventory so it can never drift from or be
          // missing on the assigned product.
          sku: stock?.sku || item.sku,
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
  });
};

async function materialRequestByReference(id, session) {
  const request = await WarehousePickRequest.findOne({ requestId: id }).session(session || null);
  if (!request) throw serviceError('Material request not found', 404, 'MATERIAL_REQUEST_NOT_FOUND');
  if (!request.sourceMaterialRequestId) {
    // Legacy rows created before sourceMaterialRequestId became required; heal in-memory
    // before any later .save() re-validates the full document.
    const jmr = await JobMaterialRequest.findOne({ warehousePickRequestId: request._id }).session(session || null)
      || await JobMaterialRequest.findOne({ jobId: request.jobId, jobType: request.jobType }).session(session || null);
    if (jmr) {
      request.sourceMaterialRequestId = jmr._id;
    }
  }
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
  invalidateInventoryCache();
  return updated;
};

// Atomically moves `qty` units of one inventory item from available to
// reserved (or, in reverse, back), deriving `status` from the post-image in
// the same round trip via a pipeline update — no separate read-modify-write.
async function shiftAvailableToReserved(inventoryId, qty, session) {
  return Inventory.findOneAndUpdate(
    { _id: inventoryId, available: { $gte: qty } },
    [
      { $set: { available: { $subtract: ['$available', qty] }, reserved: { $add: ['$reserved', qty] } } },
      { $set: { status: STOCK_STATUS_PIPELINE_EXPR } },
    ],
    { returnDocument: 'after', session, updatePipeline: true },
  );
}

async function shiftReservedToAvailable(inventoryId, qty, session) {
  return Inventory.findOneAndUpdate(
    { _id: inventoryId, reserved: { $gte: qty } },
    [
      { $set: { available: { $add: ['$available', qty] }, reserved: { $subtract: ['$reserved', qty] } } },
      { $set: { status: STOCK_STATUS_PIPELINE_EXPR } },
    ],
    { returnDocument: 'after', session, updatePipeline: true },
  );
}

// A request's service-team assignment is set on the job (Installation/Maintenance)
// by the Main Technician and is only mirrored onto the WarehousePickRequest by a
// separate cross-module side effect (service-team assignment) that fires solely
// once the request is already `reserved`. If the job's team was assigned before
// that point, the pick request never picks it up. Resolve it live from the job so
// reserve/handover always check the actual assignment instead of a copy that may
// not have landed yet.
async function resolveTeamAssignment(jobType, jobId, session) {
  const Model = materialWorkflow.modelForJobType(jobType);
  const job = await Model.findById(jobId).select('assignedTeamId assignedTeamName assignedTeam').session(session || null).lean();
  if (!job?.assignedTeamId) return null;
  let teamName = job.assignedTeamName || job.assignedTeam || '';
  if (!teamName) {
    const team = await TechTeam.findById(job.assignedTeamId).select('teamName').session(session || null).lean();
    teamName = team?.teamName || '';
  }
  return { assignedTeamId: job.assignedTeamId, assignedTeamName: teamName };
}

async function issueFromReserved(inventoryId, qty, session) {
  // Handover only consumes `reserved`; `available` (and therefore `status`)
  // already reflects these units leaving, so no status recompute is needed.
  return Inventory.findOneAndUpdate(
    { _id: inventoryId, reserved: { $gte: qty } },
    { $inc: { reserved: -qty } },
    { returnDocument: 'after', runValidators: true, session },
  );
}

exports.reserveMaterialRequest = async (id, data, user, options = {}) => {
  assertRole(user, ['INVENTORY']);
  const result = await runInTransaction(async session => {
    const request = await materialRequestByReference(id, session);
    assertRequestVersion(request, data.statusVersion);
    if (request.status !== 'pending') {
      throw serviceError('Only pending requests can be reserved', 409, 'INVALID_MATERIAL_TRANSITION');
    }
    if (!request.items.length || request.items.some(item => !item.confirmed)) {
      throw serviceError('Confirm every material line before reserving the kit', 409, 'UNCONFIRMED_MATERIAL_LINES');
    }
    const groups = aggregateReservationLines(request.items);
    const stock = await Inventory.find({ _id: { $in: groups.map(group => group.inventoryId) } })
      .select('_id sku name available')
      .session(session);
    const stockById = new Map(stock.map(item => [String(item._id), item]));
    const shortages = computeKitShortages(groups, stockById);
    if (shortages.length) {
      throw serviceError('The complete kit is not available', 409, 'INSUFFICIENT_STOCK', shortages);
    }
    for (const group of groups) {
      const updated = await shiftAvailableToReserved(group.inventoryId, group.totalQty, session);
      if (!updated) {
        throw serviceError('Stock changed while reserving; reload and retry', 409, 'STOCK_CHANGED_DURING_RESERVE');
      }
    }
    if (!request.assignedTeamId) {
      const assignment = await resolveTeamAssignment(request.jobType, request.jobId, session);
      if (assignment) {
        request.assignedTeamId = assignment.assignedTeamId;
        request.assignedTeamName = assignment.assignedTeamName;
      }
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
  }, options.session);
  invalidateInventoryCache();
  return result;
};

exports.releaseMaterialRequest = async (id, data, user, options = {}) => {
  assertRole(user, ['INVENTORY']);
  const result = await runInTransaction(async session => {
    const request = await materialRequestByReference(id, session);
    assertRequestVersion(request, data.statusVersion);
    if (request.status !== 'reserved') {
      throw serviceError('Only reserved requests can be released', 409, 'INVALID_MATERIAL_TRANSITION');
    }
    const groups = aggregateReservationLines(request.items);
    for (const group of groups) {
      const updated = await shiftReservedToAvailable(group.inventoryId, group.totalQty, session);
      if (!updated) throw serviceError('Reserved stock is inconsistent', 409, 'RESERVED_STOCK_MISMATCH');
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
    await Activity.create([{
      type: 'request',
      title: 'Material Kit Released',
      description: `${request.requestId} released by ${actorName(user, 'Inventory Manager')}`,
      actionLabel: 'View Request',
    }], { session });
    return request;
  }, options.session);
  invalidateInventoryCache();
  return result;
};

exports.handoverMaterialRequest = async (id, data, user, options = {}) => {
  assertRole(user, ['INVENTORY']);
  const result = await runInTransaction(async session => {
    const request = await materialRequestByReference(id, session);
    assertRequestVersion(request, data.statusVersion);
    if (request.status !== 'reserved') {
      throw serviceError('Only reserved requests can be handed over', 409, 'INVALID_MATERIAL_TRANSITION');
    }
    if (!request.assignedTeamId) {
      const assignment = await resolveTeamAssignment(request.jobType, request.jobId, session);
      if (assignment) {
        request.assignedTeamId = assignment.assignedTeamId;
        request.assignedTeamName = assignment.assignedTeamName;
      }
    }
    if (!request.assignedTeamId) {
      throw serviceError('The Main Technician must assign a service team first', 409, 'TEAM_ASSIGNMENT_REQUIRED');
    }
    const groups = aggregateReservationLines(request.items);
    for (const group of groups) {
      const updated = await issueFromReserved(group.inventoryId, group.totalQty, session);
      if (!updated) throw serviceError('Reserved stock is inconsistent', 409, 'RESERVED_STOCK_MISMATCH');
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
  }, options.session);
  invalidateInventoryCache();
  return result;
};
