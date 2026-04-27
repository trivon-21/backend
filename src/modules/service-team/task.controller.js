const mongoose = require('mongoose');
const Installation = require('../shared/installation/Installation');
const ServiceRequest = require('../shared/serviceRequest/ServiceRequest');
const { DEFAULT_TEAM_NAME } = require('../../config/app.config');
const {
  getRequestedTeamName,
  matchesJobTeam,
} = require('../../utils/team.utils');
const {
  WORKFLOW_STATUS,
  REQUEST_TYPES,
  DEFAULTS,
} = require('../../constants/enums');

const normalize = (value) => String(value || '').trim().toLowerCase();

const toCustomer = (customerDoc, fallbackAddress = '-') => ({
  name: customerDoc?.name || customerDoc?.customerName || DEFAULTS.UNKNOWN_CUSTOMER,
  address: customerDoc?.address || fallbackAddress,
  phone: customerDoc?.phone || null,
  email: customerDoc?.email || null,
});

const formatTask = (job, source) => {
  const customerDoc = job.customerId && typeof job.customerId === 'object' ? job.customerId : null;
  const customer = toCustomer(customerDoc, job.location || '-');
  const ticketId = job.ticketId != null && job.ticketId !== '' ? String(job.ticketId) : String(job._id);
  const serviceType = source === REQUEST_TYPES.INSTALLATION.toLowerCase()
    ? `${job.productType || 'Installation'}${job.units ? ` - ${job.units} Units` : ''}`
    : String(job.productType || job.serviceDescription || 'Service Request');

  return {
    id: ticketId,
    sourceId: String(job._id),
    type: source === REQUEST_TYPES.INSTALLATION.toLowerCase() ? REQUEST_TYPES.INSTALLATION : 'Service Request',
    customer,
    location: job.location || customer.address || '-',
    serviceType,
    status: job.status || WORKFLOW_STATUS.PENDING,
    scheduledDate: job.serviceDate || job.date || job.createdAt || null,
    detailedProductType: job.productType || '',
    description: job.serviceDescription || '',
    notesFromTechnician: job.notesFromTechnician || job.reviewNotes || '',
    materials: Array.isArray(job.materials) ? job.materials : []
  };
};

const loadTaskCandidates = async () => {
  const [installations, requests] = await Promise.all([
    Installation.find({}).populate('customerId', 'name customerName address phone email').lean(),
    ServiceRequest.find({}).populate('customerId', 'name customerName address phone email').lean()
  ]);

  return { installations, requests };
};

const findTaskRecord = async (id) => {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    return null;
  }

  const queryParts = [];
  
  if (/^\d+$/.test(normalizedId)) {
    queryParts.push({ ticketId: Number(normalizedId) });
  }

  if (mongoose.Types.ObjectId.isValid(normalizedId)) {
    queryParts.push({ _id: new mongoose.Types.ObjectId(normalizedId) });
  }

  const query = { $or: queryParts };

  const [installation, request] = await Promise.all([
    Installation.findOne(query).populate('customerId', 'name customerName address phone email').lean(),
    ServiceRequest.findOne(query).populate('customerId', 'name customerName address phone email').lean(),
  ]);

  if (installation) {
    return { source: REQUEST_TYPES.INSTALLATION.toLowerCase(), record: installation };
  }

  if (request) {
    return { source: 'service', record: request };
  }

  return null;
};

/**
 * Returns jobs assigned to Service Team B in a normalized task shape.
 */
exports.getTasks = async (req, res) => {
  try {
    const requestedTeamName = getRequestedTeamName(req, DEFAULT_TEAM_NAME);
    const { installations, requests } = await loadTaskCandidates();

    const filtered = [...installations, ...requests].filter((job) => matchesJobTeam(job, requestedTeamName));

    const formatted = filtered.map((job) => (
      job.units !== undefined
        ? formatTask(job, 'installation')
        : formatTask(job, 'service')
    ));

    res.json(formatted.sort((a, b) => new Date(b.scheduledDate || 0) - new Date(a.scheduledDate || 0)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTaskById = async (req, res) => {
  try {
    const task = await findTaskRecord(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const formatted = formatTask(task.record, task.source);
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body || {};
    const normalizedStatus = String(status || '').trim();

    if (!normalizedStatus) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }

    const task = await findTaskRecord(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const updated = task.source === 'installation'
      ? await Installation.findByIdAndUpdate(task.record._id, { status: normalizedStatus }, { new: true }).lean()
      : await ServiceRequest.findByIdAndUpdate(task.record._id, { status: normalizedStatus }, { new: true }).lean();

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.json({ success: true, status: updated.status, message: 'Task status updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};