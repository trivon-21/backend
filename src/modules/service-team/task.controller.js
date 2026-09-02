const mongoose = require('mongoose');
const Installation = require('../shared/installation/installation.model');
const ServiceRequest = require('../shared/repair/repair.model');
const ServiceReport = require('../technician/technician.model');
const Maintenance = require('../shared/maintenance/maintenance.model');
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

const toCustomer = (customerDoc, job, fallbackAddress = '-') => ({
  name: customerDoc?.fullName || customerDoc?.name || job?.fullName || job?.customerName || DEFAULTS.UNKNOWN_CUSTOMER,
  fullName: customerDoc?.fullName || customerDoc?.name || job?.fullName || job?.customerName || DEFAULTS.UNKNOWN_CUSTOMER,
  address: customerDoc?.address || job?.address || job?.location || fallbackAddress,
  phone: customerDoc?.phoneNumber || customerDoc?.phone || job?.phoneNumber || job?.contactNo || job?.phone || null,
  email: customerDoc?.email || job?.email || null,
});

const formatTask = (job, source) => {
  const customerDoc = job.customerId && typeof job.customerId === 'object' ? job.customerId : null;
  const customer = toCustomer(customerDoc, job, job.location || '-');
  const ticketId = job.ticketId != null && job.ticketId !== '' ? String(job.ticketId) : String(job._id);
  const serviceType = source === REQUEST_TYPES.INSTALLATION.toLowerCase()
    ? `${job.productType || job.acUnitModel || 'Installation'}${job.units ? ` - ${job.units} Units` : ''}`
    : source === 'maintenance'
      ? String(job.scheduledServiceType || 'Maintenance')
      : String(job.productType || job.acUnitModel || job.category || job.repairType || 'Service Request');

  return {
    id: ticketId,
    sourceId: String(job._id),
    type: source === REQUEST_TYPES.INSTALLATION.toLowerCase() ? REQUEST_TYPES.INSTALLATION : source === 'maintenance' ? 'Maintenance' : 'Service Request',
    customer,
    location: customer.address || job.location || '-',
    serviceType,
    status: job.status || WORKFLOW_STATUS.PENDING,
    scheduledDate: job.serviceDate || job.date || job.createdAt || null,
    detailedProductType: job.productType || job.acUnitModel || job.category || job.repairType || '',
    description: job.description || job.serviceDescription || job.scheduledServiceType || '',
    notesFromTechnician: job.notesFromTechnician || job.reviewNotes || '',
    materials: Array.isArray(job.materials) ? job.materials : Array.isArray(job.materialList) ? job.materialList : []
  };
};

const loadTaskCandidates = async () => {
  const [installations, requests, maintenances] = await Promise.all([
    Installation.find({}).populate('customerId', 'fullName address phoneNumber email').lean(),
    ServiceRequest.find({}).populate('customerId', 'fullName address phoneNumber email').lean(),
    Maintenance.find({}).populate('customerId', 'fullName address phoneNumber email').lean()
  ]);

  return { installations, requests, maintenances };
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

  // Also match by the string ID like SRQ-1000
  queryParts.push({ serviceRequestRef: normalizedId });
  queryParts.push({ ticketId: normalizedId }); // if ticketId is stored as string in some collections

  const query = { $or: queryParts };

  const [installation, request, maintenance] = await Promise.all([
    Installation.findOne(query).populate('customerId', 'fullName address phoneNumber email').lean(),
    ServiceRequest.findOne(query).populate('customerId', 'fullName address phoneNumber email').lean(),
    Maintenance.findOne(query).populate('customerId', 'fullName address phoneNumber email').lean(),
  ]);

  if (installation) {
    return { source: REQUEST_TYPES.INSTALLATION.toLowerCase(), record: installation };
  }

  if (maintenance) {
    return { source: 'maintenance', record: maintenance };
  }

  if (request) {
    return { source: 'service', record: request };
  }

  if (mongoose.Types.ObjectId.isValid(normalizedId)) {
    const report = await ServiceReport.findById(normalizedId).lean();
    if (report) {
      const linkedModel = report.onModel === 'Installation' ? Installation : ServiceRequest;
      const linkedRecord = await linkedModel.findById(report.serviceRequestId)
        .populate('customerId', 'fullName address phoneNumber email')
        .lean();

      if (linkedRecord) {
        return {
          source: report.onModel === 'Installation' ? REQUEST_TYPES.INSTALLATION.toLowerCase() : 'service',
          record: linkedRecord,
          serviceReport: report,
        };
      }

      return {
        source: report.onModel === 'Installation' ? REQUEST_TYPES.INSTALLATION.toLowerCase() : 'service',
        record: report,
        serviceReport: report,
      };
    }
  }

  return null;
};

/**
 * Returns jobs assigned to Service Team B in a normalized task shape.
 */
exports.getTasks = async (req, res) => {
  try {
    const requestedTeamName = getRequestedTeamName(req, DEFAULT_TEAM_NAME);
    const { installations, requests, maintenances } = await loadTaskCandidates();

    const filtered = [...installations, ...requests, ...maintenances].filter((job) => matchesJobTeam(job, requestedTeamName));

    const formatted = filtered.map((job) => {
      if (job.units !== undefined) return formatTask(job, 'installation');
      if (job.ticketId && String(job.ticketId).includes('-ACT')) return formatTask(job, 'maintenance');
      return formatTask(job, 'service');
    });

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
    if (task.serviceReport?.notesFromMainTechnician) {
      formatted.notesFromTechnician = task.serviceReport.notesFromMainTechnician;
    }
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

    let updated;
    if (task.source === 'installation') {
      updated = await Installation.findByIdAndUpdate(task.record._id, { status: normalizedStatus }, { new: true }).lean();
    } else if (task.source === 'maintenance') {
      updated = await Maintenance.findByIdAndUpdate(task.record._id, { status: normalizedStatus }, { new: true }).lean();
    } else {
      updated = await ServiceRequest.findByIdAndUpdate(task.record._id, { status: normalizedStatus }, { new: true }).lean();
    }

    if (task.serviceReport) {
      await ServiceReport.findByIdAndUpdate(task.serviceReport._id, {
        finalStatus: normalizedStatus,
        notesFromMainTechnician: task.serviceReport.notesFromMainTechnician || task.record.notesFromTechnician || '',
      });
    }

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.json({ success: true, status: updated.status, message: 'Task status updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

