const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const JobMaterialRequest = require('../../../models/JobMaterialRequest');
const WarehousePickRequest = require('../../../models/WarehousePickRequest');
const Inventory = require('../../../models/Inventory');
const ServiceTicket = require('../serviceTicket/serviceTicket.model');
const Repair = require('../repair/repair.model');
const Installation = require('../installation/installation.model');
const Maintenance = require('../maintenance/maintenance.model');
const { WORKFLOW_STATUS } = require('../../../constants/enums');

function workflowError(message, statusCode, code, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
}

function requestNumber(prefix) {
  return `${prefix}-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function modelForJobType(jobType) {
  if (jobType === 'Installation') return Installation;
  if (jobType === 'Maintenance') return Maintenance;
  return Repair;
}

function materialField(jobType) {
  return jobType === 'Maintenance' ? 'materialList' : 'materials';
}

function sourceMaterials(lines) {
  return lines.map(line => ({ item: line.itemName, quantity: line.quantity }));
}

async function setJobState(jobType, jobId, status, lines, session, extra = {}) {
  const Model = modelForJobType(jobType);
  const update = { status, ...extra };
  if (lines) update[materialField(jobType)] = sourceMaterials(lines);
  const job = await Model.findByIdAndUpdate(jobId, { $set: update }, {
    new: true,
    runValidators: true,
    session,
  });
  if (!job) throw workflowError('Linked job was not found', 404, 'JOB_NOT_FOUND');
  return job;
}

async function findSourceJob(jobId, session) {
  if (!mongoose.isValidObjectId(jobId)) throw workflowError('Job ID is invalid', 400, 'INVALID_JOB_ID');
  const options = session ? { session } : {};
  const [repair, installation, maintenance] = await Promise.all([
    Repair.findById(jobId, null, options),
    Installation.findById(jobId, null, options),
    Maintenance.findById(jobId, null, options),
  ]);
  if (repair) return { job: repair, jobType: 'Repair' };
  if (installation) return { job: installation, jobType: 'Installation' };
  if (maintenance) return { job: maintenance, jobType: 'Maintenance' };
  return null;
}

async function materialLines(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw workflowError('At least one catalog material is required', 400, 'MATERIALS_REQUIRED');
  }
  const quantities = new Map();
  for (const line of input) {
    const inventoryId = String(line.inventoryId || '').trim();
    const quantity = Number(line.quantity);
    if (!mongoose.isValidObjectId(inventoryId)) {
      throw workflowError('Every material must reference a catalog item', 400, 'INVENTORY_REFERENCE_REQUIRED');
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw workflowError('Material quantities must be positive whole numbers', 400, 'INVALID_MATERIAL_QUANTITY');
    }
    quantities.set(inventoryId, (quantities.get(inventoryId) || 0) + quantity);
  }
  const inventory = await Inventory.find({ _id: { $in: [...quantities.keys()] } });
  if (inventory.length !== quantities.size) {
    throw workflowError('One or more catalog materials were not found', 404, 'INVENTORY_ITEM_NOT_FOUND');
  }
  return inventory.map(item => {
    if (item.isActive === false) {
      throw workflowError(`${item.name} is inactive and cannot be requested`, 409, 'INACTIVE_INVENTORY_ITEM');
    }
    if (item.isSerialized) {
      throw workflowError(`${item.name} must use the serialized asset or dispatch workflow`, 409, 'SERIALIZED_ITEM_NOT_ALLOWED');
    }
    const quantity = quantities.get(String(item._id));
    const unitPrice = Number(item.unitCost ?? item.pricing?.costPerUnit ?? 0);
    return {
      lineId: randomUUID(),
      inventoryId: item._id,
      sku: item.sku,
      itemName: item.name,
      quantity,
      unitPrice,
      total: unitPrice * quantity,
    };
  });
}

async function ensureJob(jobId, lines, session) {
  const existing = await findSourceJob(jobId, session);
  if (existing) return existing;
  const ticket = await ServiceTicket.findById(jobId).session(session);
  if (!ticket) throw workflowError('Job was not found', 404, 'JOB_NOT_FOUND');
  const isMaintenance = String(ticket.requestType || ticket.serviceType || '').toLowerCase().includes('maintenance');
  if (isMaintenance) {
    const [job] = await Maintenance.create([{
      _id: ticket._id,
      ticketId: `MS-${String(ticket._id).slice(-8).toUpperCase()}`,
      maintenanceType: 'Customer Initiated',
      customerId: ticket.customerId,
      date: ticket.createdAt || new Date(),
      status: WORKFLOW_STATUS.PENDING,
      materialList: sourceMaterials(lines),
    }], { session });
    await ServiceTicket.deleteOne({ _id: ticket._id }).session(session);
    return { job, jobType: 'Maintenance' };
  }
  const [job] = await Repair.create([{
    _id: ticket._id,
    serviceTicketId: ticket._id,
    customerId: ticket.customerId,
    location: ticket.location || '-',
    status: WORKFLOW_STATUS.PENDING,
    materials: sourceMaterials(lines),
  }], { session });
  await ServiceTicket.deleteOne({ _id: ticket._id }).session(session);
  return { job, jobType: 'Repair' };
}

async function findRequest(identifier, session) {
  const value = String(identifier || '').replace(/^#/, '').trim();
  const clauses = [{ requestId: value }];
  if (mongoose.isValidObjectId(value)) clauses.push({ _id: value }, { jobId: value });
  return JobMaterialRequest.findOne({ $or: clauses }).session(session || null);
}

async function readRequest(request) {
  const Model = modelForJobType(request.jobType);
  const job = await Model.findById(request.jobId)
    .populate('customerId', 'fullName email phoneNumber contactNo address')
    .lean();
  const customer = job?.customerId && typeof job.customerId === 'object' ? job.customerId : null;
  const statusMap = { PENDING: 'Pending', APPROVED: 'Finance Approved', REJECTED: 'Finance Rejected', CANCELLED: 'Cancelled' };
  return {
    _id: request._id,
    materialRequestId: request.requestId,
    ticketId: request.jobId,
    requestType: request.jobType === 'Repair' ? 'Service' : request.jobType,
    serviceType: request.jobType,
    customerName: customer?.fullName || job?.fullName || request.requesterName,
    customerEmail: customer?.email || job?.customerEmail || '-',
    customerContactNo: customer?.phoneNumber || customer?.contactNo || job?.customerPhone || '-',
    location: job?.location || customer?.address || '-',
    createdAt: request.createdAt,
    status: statusMap[request.status],
    approvalStatus: request.status,
    fulfillmentStatus: request.fulfillmentStatus,
    financeNotes: request.financeDecision?.reason || request.notes,
    statusVersion: request.statusVersion,
    materials: request.items.map(line => ({
      lineId: line.lineId,
      inventoryId: line.inventoryId,
      item: line.itemName,
      name: line.itemName,
      sku: line.sku,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: line.total,
    })),
    total: request.items.reduce((sum, line) => sum + Number(line.total || 0), 0),
  };
}

exports.getCatalog = async () => Inventory.find({ isSerialized: false, isActive: { $ne: false } })
  .select('name sku unit available reserved unitCost pricing itemClass subcategory')
  .sort({ name: 1 })
  .lean();

exports.listRequests = async (query = {}) => {
  const filter = {};
  if (query.status) filter.status = String(query.status).toUpperCase();
  const requests = await JobMaterialRequest.find(filter).sort({ createdAt: -1 });
  return Promise.all(requests.map(readRequest));
};

exports.listEligibleJobs = async () => {
  const eligibleLegacyStatuses = [
    'New', 'PENDING', 'Pending', 'Finance Approved', 'Finance Rejected', 'Sent to IM', 'Materials Ready',
  ];
  const [tickets, repairs, installations, maintenances, requests] = await Promise.all([
    ServiceTicket.find({ status: { $in: ['New', 'Reviewed', 'open'] } })
      .populate('customerId', 'fullName email phoneNumber address').lean(),
    Repair.find({ status: { $in: eligibleLegacyStatuses } })
      .populate('customerId', 'fullName email phoneNumber address').lean(),
    Installation.find({ status: { $in: eligibleLegacyStatuses } })
      .populate('customerId', 'fullName email phoneNumber address').lean(),
    Maintenance.find({ status: { $in: eligibleLegacyStatuses } })
      .populate('customerId', 'fullName email phoneNumber address').lean(),
    JobMaterialRequest.find().lean(),
  ]);
  const canonicalByJob = new Map(requests.map(request => [String(request.jobId), request]));
  const customerFields = job => ({
    customerName: job.customerId?.fullName || 'Unknown Customer',
    customerEmail: job.customerId?.email || '-',
    customerContactNo: job.customerId?.phoneNumber || '-',
    customerAddress: job.customerId?.address || job.location || '-',
  });
  const requestFields = job => {
    const request = canonicalByJob.get(String(job._id));
    return request?.status === 'REJECTED' ? {
      status: WORKFLOW_STATUS.FINANCE_REJECTED,
      materials: request.items.map(line => ({
        inventoryId: line.inventoryId,
        sku: line.sku,
        item: line.itemName,
        quantity: line.quantity,
      })),
      financeNotes: request.financeDecision?.reason || '',
    } : {
      status: job.status || WORKFLOW_STATUS.NEW,
      materials: [],
      financeNotes: '',
    };
  };
  const isEligible = job => {
    const request = canonicalByJob.get(String(job._id));
    return !request || request.status === 'REJECTED';
  };
  return [
    ...tickets.map(ticket => ({
      ticketId: ticket._id,
      productType: ticket.subject || ticket.category || 'N/A',
      serviceType: ticket.requestType || ticket.serviceType || 'Repair',
      serviceDescription: ticket.description || '-',
      requestType: String(ticket.requestType || '').toLowerCase().includes('maintenance') ? 'Maintenance' : 'Service',
      location: ticket.location || '-',
      isUnderWarranty: false,
      isFreeOfCharge: false,
      ...customerFields(ticket),
      ...requestFields(ticket),
    })),
    ...repairs.filter(isEligible).map(job => ({
      ticketId: job._id,
      productType: job.repairType || 'Repair',
      serviceType: 'Repair',
      serviceDescription: job.notes || 'Repair material request',
      requestType: 'Service',
      location: job.location || '-',
      isUnderWarranty: false,
      isFreeOfCharge: false,
      ...customerFields(job),
      ...requestFields(job),
    })),
    ...installations.filter(isEligible).map(job => ({
      ticketId: job._id,
      productType: job.productType || 'Installation',
      serviceType: 'Installation',
      serviceDescription: job.location || 'Installation material request',
      requestType: 'Installation',
      location: job.location || '-',
      siteDetails: job.siteDetails || {},
      isUnderWarranty: false,
      isFreeOfCharge: false,
      ...customerFields(job),
      ...requestFields(job),
    })),
    ...maintenances.filter(isEligible).map(job => ({
      ticketId: job._id,
      productType: job.maintenanceType || 'Maintenance',
      serviceType: 'Maintenance',
      serviceDescription: 'Scheduled maintenance',
      requestType: 'Maintenance',
      location: job.location || '-',
      isUnderWarranty: Boolean(job.isUnderWarranty),
      isFreeOfCharge: Boolean(job.isUnderWarranty),
      ...customerFields(job),
      ...requestFields(job),
    })),
  ];
};

exports.submit = async (data, user) => {
  const jobId = String(data.newRequestId || data.jobId || data.ticketId || '').replace(/^#/, '');
  const lines = await materialLines(data.materials);
  return mongoose.connection.transaction(async session => {
    const { job, jobType } = await ensureJob(jobId, lines, session);
    let request = await JobMaterialRequest.findOne({ jobId: job._id, jobType }).session(session);
    if (request && request.status !== 'REJECTED') {
      throw workflowError('This job already has an active material request', 409, 'ACTIVE_MATERIAL_REQUEST_EXISTS');
    }
    if (request) {
      request.items = lines;
      request.notes = String(data.financeNotes || '');
      request.status = 'PENDING';
      request.fulfillmentStatus = 'NOT_SENT';
      request.financeDecision = {};
      request.statusVersion += 1;
      await request.save({ session });
    } else {
      [request] = await JobMaterialRequest.create([{
        requestId: requestNumber('JMR'),
        jobId: job._id,
        jobType,
        requestedBy: user._id,
        requesterName: user.fullName || 'Main Technician',
        notes: String(data.financeNotes || ''),
        items: lines,
      }], { session });
    }
    await setJobState(jobType, job._id, WORKFLOW_STATUS.PENDING, lines, session);
    return readRequest(request);
  });
};

exports.decide = async (identifier, decision, reason, user, statusVersion) => mongoose.connection.transaction(async session => {
  const request = await findRequest(identifier, session);
  if (!request) throw workflowError('Material request was not found', 404, 'MATERIAL_REQUEST_NOT_FOUND');
  if (statusVersion !== undefined && Number(statusVersion) !== Number(request.statusVersion)) {
    throw workflowError('The material request changed; reload before deciding it', 409, 'STALE_MATERIAL_REQUEST');
  }
  if (request.status !== 'PENDING') {
    throw workflowError('Only pending material requests can be decided', 409, 'INVALID_MATERIAL_TRANSITION');
  }
  if (decision === 'REJECTED' && !String(reason || '').trim()) {
    throw workflowError('A rejection reason is required', 400, 'REJECTION_REASON_REQUIRED');
  }
  request.status = decision;
  request.financeDecision = {
    actorId: user._id,
    actorName: user.fullName || 'Finance Officer',
    reason: String(reason || ''),
    decidedAt: new Date(),
  };
  request.statusVersion += 1;
  await request.save({ session });
  await setJobState(request.jobType, request.jobId,
    decision === 'APPROVED' ? WORKFLOW_STATUS.FINANCE_APPROVED : WORKFLOW_STATUS.FINANCE_REJECTED,
    null, session);
  return readRequest(request);
});

exports.sendToInventory = async (identifier, statusVersion) => {
  try {
    return await mongoose.connection.transaction(async session => {
      const request = await findRequest(identifier, session);
      if (!request) throw workflowError('Material request was not found', 404, 'MATERIAL_REQUEST_NOT_FOUND');
      const linkedWarehouse = await WarehousePickRequest.findOne({ sourceMaterialRequestId: request._id }).session(session);
      if (linkedWarehouse) return linkedWarehouse;
      if (statusVersion !== undefined && Number(statusVersion) !== Number(request.statusVersion)) {
        throw workflowError('The material request changed; reload before sending it', 409, 'STALE_MATERIAL_REQUEST');
      }
      if (request.status !== 'APPROVED') {
        throw workflowError('Finance approval is required before inventory fulfillment', 409, 'FINANCE_APPROVAL_REQUIRED');
      }
      const Model = modelForJobType(request.jobType);
      const job = await Model.findById(request.jobId).session(session);
      if (!job) throw workflowError('Linked job was not found', 404, 'JOB_NOT_FOUND');
      const [warehouse] = await WarehousePickRequest.create([{
        requestId: requestNumber('WPR'),
        sourceMaterialRequestId: request._id,
        jobId: request.jobId,
        jobType: request.jobType,
        requesterId: request.requestedBy,
        requester: request.requesterName,
        date: new Date().toISOString().slice(0, 10),
        location: job.location || '-',
        status: 'pending',
        items: request.items.map(line => ({
          lineId: line.lineId,
          inventoryId: line.inventoryId,
          name: line.itemName,
          qty: line.quantity,
          sku: line.sku,
          confirmed: false,
        })),
      }], { session });
      request.warehousePickRequestId = warehouse._id;
      request.fulfillmentStatus = 'PENDING';
      request.statusVersion += 1;
      await request.save({ session });
      await setJobState(request.jobType, request.jobId, WORKFLOW_STATUS.SENT_TO_IM, null, session);
      return warehouse;
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const request = await findRequest(identifier);
    const existing = request && await WarehousePickRequest.findOne({ sourceMaterialRequestId: request._id });
    if (existing) return existing;
    throw workflowError('The material request was already sent', 409, 'DUPLICATE_WAREHOUSE_REQUEST');
  }
};

exports.cancel = async (identifier, reason, statusVersion) => mongoose.connection.transaction(async session => {
  const request = await findRequest(identifier, session);
  if (!request) throw workflowError('Material request was not found', 404, 'MATERIAL_REQUEST_NOT_FOUND');
  if (statusVersion !== undefined && Number(statusVersion) !== Number(request.statusVersion)) {
    throw workflowError('The material request changed; reload before cancelling it', 409, 'STALE_MATERIAL_REQUEST');
  }
  if (['RESERVED', 'HANDED_OVER'].includes(request.fulfillmentStatus)) {
    throw workflowError('Release reserved stock or use the returns workflow before cancellation', 409, 'MATERIAL_REQUEST_NOT_CANCELLABLE');
  }
  request.status = 'CANCELLED';
  request.fulfillmentStatus = 'CANCELLED';
  request.notes = String(reason || request.notes || 'Cancelled');
  request.statusVersion += 1;
  await request.save({ session });
  await setJobState(request.jobType, request.jobId, WORKFLOW_STATUS.CANCELLED, null, session);
  if (request.warehousePickRequestId) {
    await WarehousePickRequest.updateOne({ _id: request.warehousePickRequestId }, { $set: { status: 'cancelled' } }, { session });
  }
  return readRequest(request);
});

exports.workflowError = workflowError;
exports.modelForJobType = modelForJobType;
exports.setJobState = setJobState;
