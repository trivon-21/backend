const mongoose = require('mongoose');
const Ticket = require('../../models/Ticket');
const User = require('../../models/User');
const ReceiptAuthorization = require('../../models/ReceiptAuthorization');

const TECHNICIAN_ROLES = ['MAIN_TECH', 'SERVICE_TEAM', 'INSPECTION'];
const SAFE_CUSTOMER_FIELDS = 'fullName email phoneNumber address';
const SAFE_TECHNICIAN_FIELDS = 'fullName email phoneNumber role';

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
  const allTickets = await Ticket.find()
    .populate('customerId', SAFE_CUSTOMER_FIELDS)
    .populate('assignedTechnicianId', SAFE_TECHNICIAN_FIELDS)
    .sort({ createdAt: -1 })
    .lean();
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
  const update = {};
  if (patch.status !== undefined) {
    if (!['open', 'in-progress', 'resolved', 'escalated'].includes(patch.status)) {
      throw serviceError('Invalid ticket status', 400, 'INVALID_STATUS');
    }
    update.status = patch.status;
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
      update.assignedTo = '';
    } else {
      if (!mongoose.isValidObjectId(patch.assignedTechnicianId)) {
        throw serviceError('Technician not found', 404, 'TECHNICIAN_NOT_FOUND');
      }
      const technician = await User.findOne({ _id: patch.assignedTechnicianId, role: { $in: TECHNICIAN_ROLES } });
      if (!technician) throw serviceError('Technician not found or role is not assignable', 404, 'TECHNICIAN_NOT_FOUND');
      update.assignedTechnicianId = technician._id;
      update.assignedTo = technician.fullName;
      if (patch.status === undefined) update.status = 'in-progress';
    }
  }

  return Ticket.findByIdAndUpdate(id, update, { new: true, runValidators: true })
    .populate('customerId', SAFE_CUSTOMER_FIELDS)
    .populate('assignedTechnicianId', SAFE_TECHNICIAN_FIELDS)
    .lean();
};

exports.TECHNICIAN_ROLES = TECHNICIAN_ROLES;
