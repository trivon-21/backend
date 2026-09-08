const ServiceTicket = require('../../models/ServiceTicket');
const InspectionTicket = require('../../models/InspectionTicket');
const Installation = require('../../models/Installation');
require('../../models/User');
const {
  canonicalSourceType,
  normalizeServiceStatus,
  normalizeInstallationStatus,
  normalizeInspectionStatus,
} = require('./manager.work-item-domain');

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
    sourceType: canonicalSourceType('inspection-ticket'),
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
    sourceType: canonicalSourceType('installation'),
    // Installations are assigned to a TechTeam, not an individual technician —
    // assignedTeamId (from ...ticket above) carries the identity; leaving
    // assignedTechnicianId unset here prevents workload grouping from
    // mistaking a team assignment for an individual one.
    assignedTechnicianId: null,
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
  normalizeInspectionTicket,
  normalizeInstallation,
  SAFE_TECHNICIAN_FIELDS,
};
