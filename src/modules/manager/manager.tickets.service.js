const mongoose = require('mongoose');
const ServiceTicket = require('../../models/ServiceTicket');
const User = require('../../models/User');
const ReceiptAuthorization = require('../../models/ReceiptAuthorization');
const Activity = require('../../models/Activity');
const {
  loadManagerTickets,
  normalizeServiceTicket,
  SAFE_TECHNICIAN_FIELDS,
} = require('./manager.ticket-read-model');

const TECHNICIAN_ROLES = ['MAIN_TECH', 'SERVICE_TEAM', 'INSPECTION'];

function serviceError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function ensureOnline() {
  if (mongoose.connection.readyState !== 1) {
    throw serviceError('Manager ticket service is offline', 503, 'SERVICE_OFFLINE');
  }
}

exports.listTickets = async (filters = {}) => {
  ensureOnline();
  const allTickets = await loadManagerTickets();
  const ids = allTickets.map(ticket => String(ticket._id));
  const references = allTickets.map(ticket => ticket.ticketId);
  const authorizations = await ReceiptAuthorization.find({
    $or: [
      { affectedWorkId: { $in: ids } },
      { affectedWorkReference: { $in: references } },
    ],
  }).populate('inventoryId', 'name sku available reorderLevel').lean();
  const constraintsByTicket = new Map();
  for (const authorization of authorizations) {
    const key = authorization.affectedWorkId || references.find(reference => reference === authorization.affectedWorkReference);
    if (!key) continue;
    const constraints = constraintsByTicket.get(String(key)) || [];
    constraints.push({
      authorizationId: authorization._id,
      authorizationNumber: authorization.authorizationNumber,
      reason: authorization.nonPoReason,
      status: authorization.status,
      financeReviewStatus: authorization.financeReviewStatus,
      authorizedQuantity: authorization.authorizedQuantity,
      receivedQuantity: authorization.receivedQuantity,
      item: authorization.inventoryId || authorization.newItemSnapshot,
    });
    constraintsByTicket.set(String(key), constraints);
  }
  allTickets.forEach(ticket => {
    ticket.inventoryConstraints = constraintsByTicket.get(String(ticket._id))
      || constraintsByTicket.get(ticket.ticketId)
      || [];
  });

  let tickets = allTickets;
  if (filters.status && filters.status !== 'all') tickets = tickets.filter((ticket) => ticket.status === filters.status);
  if (filters.priority && filters.priority !== 'all') tickets = tickets.filter((ticket) => ticket.priority === filters.priority);

  const summary = {
    total: allTickets.length,
    open: allTickets.filter((ticket) => ticket.status === 'open').length,
    inProgress: allTickets.filter((ticket) => ticket.status === 'in-progress').length,
    escalated: allTickets.filter((ticket) => ticket.status === 'escalated').length,
    resolved: allTickets.filter((ticket) => ticket.status === 'resolved').length
  };
  return { status: 'Operational', summary, tickets };
};

exports.listTechnicians = async () => {
  ensureOnline();
  return User.find({ role: { $in: TECHNICIAN_ROLES } }, SAFE_TECHNICIAN_FIELDS).sort({ fullName: 1 }).lean();
};

exports.updateTicket = async (id, patch) => {
  ensureOnline();
  if (!mongoose.isValidObjectId(id)) throw serviceError('Ticket not found', 404, 'TICKET_NOT_FOUND');
  if (patch.sourceType && !['service', 'maintenance'].includes(patch.sourceType)) {
    throw serviceError('Inspection and installation tickets are managed by their owning workflow', 409, 'DOMAIN_MANAGED_TICKET');
  }
  const update = {};
  if (patch.status !== undefined) {
    if (!['open', 'in-progress', 'resolved', 'escalated'].includes(patch.status)) {
      throw serviceError('Invalid ticket status', 400, 'INVALID_STATUS');
    }
    update.status = {
      open: 'New',
      'in-progress': 'Assigned',
      resolved: 'resolved',
      escalated: 'escalated',
    }[patch.status];
    update.resolvedAt = patch.status === 'resolved' ? new Date() : null;
  }
  if (patch.priority !== undefined) {
    if (!['high', 'medium', 'low'].includes(patch.priority)) {
      throw serviceError('Invalid ticket priority', 400, 'INVALID_PRIORITY');
    }
    update.priority = patch.priority;
  }
  if (patch.assignedTechnicianId !== undefined) {
    if (!patch.assignedTechnicianId) {
      update.assignedTechnicianId = null;
    } else {
      if (!mongoose.isValidObjectId(patch.assignedTechnicianId)) {
        throw serviceError('Technician not found', 404, 'TECHNICIAN_NOT_FOUND');
      }
      const technician = await User.findOne({ _id: patch.assignedTechnicianId, role: { $in: TECHNICIAN_ROLES } });
      if (!technician) throw serviceError('Technician not found or role is not assignable', 404, 'TECHNICIAN_NOT_FOUND');
      update.assignedTechnicianId = technician._id;
      if (patch.status === undefined) update.status = 'Assigned';
    }
  }

  const ticket = await ServiceTicket.findByIdAndUpdate(id, update, { new: true, runValidators: true })
    .populate('customerId', 'fullName email phoneNumber address')
    .populate('assignedTechnicianId', SAFE_TECHNICIAN_FIELDS)
    .lean();
  if (!ticket) throw serviceError('Service ticket not found', 404, 'TICKET_NOT_FOUND');
  return normalizeServiceTicket(ticket);
};

function operationalStatus(ticket) {
  if (ticket.sourceType === 'inspection') {
    return {
      PENDING_PAYMENT: 'awaiting-payment',
      PAYMENT_UNDER_REVIEW: 'payment-review',
      PAYMENT_CONFIRMED: 'ready',
      PAYMENT_REJECTED: 'escalated',
      INSPECTION_SCHEDULED: 'scheduled',
      ONGOING: 'in-progress',
      REPORT_RECORDED: 'awaiting-verification',
      INSPECTED: 'closed',
    }[ticket.sourceStatus] || 'unknown';
  }
  if (ticket.sourceType === 'installation') {
    return {
      Pending: 'ready',
      Assigned: 'assigned',
      'In Progress': 'in-progress',
      Completed: 'closed',
      Cancelled: 'cancelled',
    }[ticket.sourceStatus] || 'unknown';
  }
  return ticket.status === 'resolved' ? 'closed' : ticket.status;
}

function safeCustomer(ticket) {
  const customer = ticket.customerDetails;
  if (!customer) return null;
  return {
    id: String(customer._id),
    fullName: customer.fullName,
    email: customer.email,
    phoneNumber: customer.phoneNumber,
    address: customer.address,
  };
}

function allowedActions(ticket) {
  if (!['service', 'maintenance'].includes(ticket.sourceType)) return [];
  if (ticket.status === 'resolved') return ['update-control', 'reopen'];
  if (ticket.status === 'escalated') return ['update-control', 'clear-escalation', 'close'];
  return ['update-control', 'escalate', 'close'];
}

function toOperationalWorkItem(ticket) {
  const technician = ticket.assignedTechnicianId && typeof ticket.assignedTechnicianId === 'object'
    ? {
      id: String(ticket.assignedTechnicianId._id),
      fullName: ticket.assignedTechnicianId.fullName,
      role: ticket.assignedTechnicianId.role,
    }
    : null;
  const blockers = (ticket.inventoryConstraints || [])
    .filter((constraint) => !['completed', 'reconciled'].includes(constraint.status))
    .map((constraint) => ({
      type: 'inventory',
      message: `${constraint.authorizationNumber} is ${constraint.status}`,
      status: constraint.financeReviewStatus,
    }));
  return {
    id: String(ticket._id),
    sourceType: ticket.sourceType,
    sourceId: String(ticket._id),
    reference: ticket.ticketId,
    customer: safeCustomer(ticket),
    category: ticket.category,
    operationalStatus: operationalStatus(ticket),
    domainStatus: ticket.sourceStatus,
    priority: ticket.priority,
    slaDueAt: ticket.slaDueAt || null,
    assignedTeam: ticket.sourceType === 'installation' && ticket.assignedTo
      ? { id: String(ticket.assignedTeamId || ''), teamName: ticket.assignedTo }
      : null,
    assignedTechnician: technician,
    escalated: ticket.status === 'escalated',
    managerClosed: ticket.status === 'resolved',
    blockers,
    children: (ticket.inventoryConstraints || []).map((constraint) => ({
      type: 'inventory-authorization',
      id: String(constraint.authorizationId),
      status: constraint.status,
      authorizationNumber: constraint.authorizationNumber,
    })),
    allowedActions: allowedActions(ticket),
    version: Number(ticket.__v || 0),
    technicalComplete: ticket.status === 'resolved',
    reportComplete: ticket.status === 'resolved',
    createdAt: ticket.createdAt || null,
    updatedAt: ticket.updatedAt || null,
  };
}

exports.listWorkItems = async (filters = {}) => {
  const result = await exports.listTickets({});
  let items = result.tickets.map(toOperationalWorkItem);
  if (filters.type && filters.type !== 'all') items = items.filter((item) => item.sourceType === filters.type);
  if (filters.status && filters.status !== 'all') items = items.filter((item) => item.operationalStatus === filters.status);
  if (filters.priority && filters.priority !== 'all') items = items.filter((item) => item.priority === filters.priority);
  if (filters.assignment === 'assigned') items = items.filter((item) => item.assignedTeam || item.assignedTechnician);
  if (filters.assignment === 'unassigned') items = items.filter((item) => !item.assignedTeam && !item.assignedTechnician);
  if (filters.sla === 'overdue') items = items.filter((item) => item.slaDueAt && new Date(item.slaDueAt) <= new Date() && !item.managerClosed);

  const all = result.tickets.map(toOperationalWorkItem);
  const summary = {
    total: all.length,
    open: all.filter((item) => ['open', 'ready', 'awaiting-payment', 'payment-review'].includes(item.operationalStatus)).length,
    inProgress: all.filter((item) => ['assigned', 'scheduled', 'in-progress'].includes(item.operationalStatus)).length,
    escalated: all.filter((item) => item.operationalStatus === 'escalated').length,
    awaitingVerification: all.filter((item) => item.operationalStatus === 'awaiting-verification').length,
    closed: all.filter((item) => item.operationalStatus === 'closed').length,
  };
  const page = Math.max(1, Number(filters.page || 1));
  const limit = 25;
  const total = items.length;
  return { status: 'Operational', summary, page, limit, total, items: items.slice((page - 1) * limit, page * limit) };
};

async function editableServiceTicket(sourceType, sourceId, expectedVersion) {
  ensureOnline();
  if (!['service', 'maintenance'].includes(sourceType)) {
    throw serviceError('This work item is read-only and must be changed by its owning workflow', 409, 'DOMAIN_MANAGED_TICKET');
  }
  if (!mongoose.isValidObjectId(sourceId)) throw serviceError('Work item not found', 404, 'TICKET_NOT_FOUND');
  const ticket = await ServiceTicket.findById(sourceId);
  if (!ticket) throw serviceError('Work item not found', 404, 'TICKET_NOT_FOUND');
  if (Number(expectedVersion) !== Number(ticket.__v || 0)) {
    throw serviceError('This work item changed after it was opened; refresh and try again', 409, 'STALE_WORK_ITEM');
  }
  return ticket;
}

async function savedWorkItem(ticket) {
  await ticket.populate('customerId', 'fullName email phoneNumber address');
  await ticket.populate('assignedTechnicianId', SAFE_TECHNICIAN_FIELDS);
  return toOperationalWorkItem(normalizeServiceTicket(ticket.toObject()));
}

exports.updateWorkItemControl = async (sourceType, sourceId, input) => {
  const ticket = await editableServiceTicket(sourceType, sourceId, input.expectedVersion);
  if (!['high', 'medium', 'low'].includes(input.priority)) {
    throw serviceError('Priority must be high, medium, or low', 400, 'INVALID_PRIORITY');
  }
  if (input.slaDueAt && Number.isNaN(new Date(input.slaDueAt).getTime())) {
    throw serviceError('SLA deadline is invalid', 400, 'INVALID_SLA');
  }
  ticket.priority = input.priority;
  ticket.slaDueAt = input.slaDueAt ? new Date(input.slaDueAt) : undefined;
  await ticket.save();
  return savedWorkItem(ticket);
};

exports.runWorkItemAction = async (sourceType, sourceId, action, input) => {
  const ticket = await editableServiceTicket(sourceType, sourceId, input.expectedVersion);
  const statuses = {
    escalate: 'escalated',
    'clear-escalation': 'Assigned',
    close: 'resolved',
    reopen: 'New',
  };
  if (!statuses[action]) throw serviceError('Unsupported work item action', 400, 'INVALID_ACTION');
  const reason = String(input.reason || '').trim();
  if (!reason) throw serviceError('A reason is required', 400, 'REASON_REQUIRED');
  ticket.status = statuses[action];
  ticket.resolvedAt = action === 'close' ? new Date() : undefined;
  await ticket.save();
  await Activity.create({
    type: action === 'escalate' ? 'alert' : 'request',
    title: `Service ticket ${action.replaceAll('-', ' ')}`,
    description: `${String(ticket._id)}: ${reason}`,
    actionLabel: 'View Ticket',
  });
  return savedWorkItem(ticket);
};

exports.TECHNICIAN_ROLES = TECHNICIAN_ROLES;
