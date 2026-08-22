const ServiceTicket = require('../../models/ServiceTicket');
const InspectionTicket = require('../../models/InspectionTicket');
const Installation = require('../../models/Installation');

const SAFE_CUSTOMER_FIELDS = 'fullName email phoneNumber address';
const SAFE_TECHNICIAN_FIELDS = 'fullName email phoneNumber role';

function displayId(prefix, id) {
  return `${prefix}-${String(id).slice(-6).toUpperCase()}`;
}

function customerFields(customer) {
  return {
    customerId: customer?._id || customer || null,
    customer: customer?.fullName || 'Customer',
    customerDetails: customer && typeof customer === 'object' ? customer : undefined,
  };
}

function normalizeServiceStatus(status) {
  if (['resolved', 'Completed', 'Closed'].includes(status)) return 'resolved';
  if (['escalated', 'Rejected', 'Cancelled'].includes(status)) return 'escalated';
  if (['Reviewed', 'Assigned', 'In Progress', 'in-progress'].includes(status)) return 'in-progress';
  return 'open';
}

function normalizeInspectionStatus(status) {
  if (status === 'INSPECTED') return 'resolved';
  if (status === 'PAYMENT_REJECTED') return 'escalated';
  if (['INSPECTION_SCHEDULED', 'ONGOING', 'REPORT_RECORDED'].includes(status)) return 'in-progress';
  return 'open';
}

function normalizeInstallationStatus(status) {
  if (status === 'Completed') return 'resolved';
  if (status === 'Cancelled') return 'escalated';
  if (['Assigned', 'In Progress'].includes(status)) return 'in-progress';
  return 'open';
}

function normalizeServiceTicket(ticket) {
  const status = normalizeServiceStatus(ticket.status);
  return {
    ...ticket,
    ...customerFields(ticket.customerId),
    ticketId: displayId('SVC', ticket._id),
    subject: ticket.subject || `${ticket.requestType || 'Service'} request`,
    category: ticket.category || String(ticket.requestType || 'repair').toLowerCase(),
    status,
    resolvedAt: ticket.resolvedAt || (status === 'resolved' ? ticket.updatedAt : undefined),
    sourceStatus: ticket.status,
    sourceType: ticket.requestType === 'Maintenance' ? 'maintenance' : 'service',
    assignedTo: ticket.assignedTechnicianId?.fullName || '',
    editable: true,
  };
}

function normalizeInspectionTicket(ticket) {
  return {
    ...ticket,
    ...customerFields(ticket.customerId),
    ticketId: displayId('INS', ticket._id),
    subject: 'Installation inspection',
    description: ticket.rejectionReason || 'Inspection workflow ticket',
    category: 'inspection',
    priority: 'medium',
    status: normalizeInspectionStatus(ticket.status),
    sourceStatus: ticket.status,
    sourceType: 'inspection-ticket',
    assignedTechnicianId: null,
    assignedTo: '',
    slaDueAt: ticket.scheduledDate || ticket.scheduledAt,
    resolvedAt: ticket.inspectedAt,
    editable: false,
  };
}

function normalizeInstallation(ticket) {
  return {
    ...ticket,
    ...customerFields(ticket.customerId),
    ticketId: displayId('INST', ticket._id),
    subject: `${ticket.productType || 'AC'} installation`,
    description: ticket.location || 'Installation work order',
    category: 'installation',
    priority: 'medium',
    status: normalizeInstallationStatus(ticket.status),
    sourceStatus: ticket.status,
    sourceType: 'installation',
    assignedTechnicianId: ticket.assignedTeamId || null,
    assignedTo: ticket.assignedTeamName || '',
    slaDueAt: ticket.serviceDate,
    resolvedAt: ticket.status === 'Completed' ? ticket.updatedAt : undefined,
    editable: false,
  };
}

async function loadManagerTickets() {
  const [serviceTickets, inspectionTickets, installations] = await Promise.all([
    ServiceTicket.find()
      .populate('customerId', SAFE_CUSTOMER_FIELDS)
      .populate('assignedTechnicianId', SAFE_TECHNICIAN_FIELDS)
      .lean(),
    InspectionTicket.find().populate('customerId', SAFE_CUSTOMER_FIELDS).lean(),
    Installation.find().populate('customerId', SAFE_CUSTOMER_FIELDS).lean(),
  ]);

  return [
    ...serviceTickets.map(normalizeServiceTicket),
    ...inspectionTickets.map(normalizeInspectionTicket),
    ...installations.map(normalizeInstallation),
  ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

module.exports = {
  loadManagerTickets,
  normalizeServiceTicket,
  SAFE_TECHNICIAN_FIELDS,
};
