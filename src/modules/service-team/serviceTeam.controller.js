// src/controllers/techTeam.controller.js
const logger = require('../../utils/logger');
logger.debug('serviceTeam.controller loaded');
const TechTeam = require('../shared/tech-teams/techTeam.model');
const TechTeamMember = require('../shared/tech-teams/techTeamMember.model');
const Customer = require('../user/user.model');
const ServiceRequest = require('../shared/repair/repair.model');
const Installation = require('../shared/installation/installation.model');
const Inspection = require('../shared/inspection/inspectionTicket.model');
const Maintenance = require('../shared/maintenance/maintenance.model');
const WarehousePickRequest = require('../../models/WarehousePickRequest');
const mongoose = require('mongoose');
const {
  WORKFLOW_STATUS,
  EXECUTION_STATUS,
  MAINTENANCE_STATUS,
  TEAM_STATUS,
  REQUEST_TYPES,
  STATUS_GROUPS,
  DEFAULTS,
} = require('../../constants/enums');

const activeStatuses = STATUS_GROUPS.ACTIVE_WORKLOAD;
const inProgressStatus = EXECUTION_STATUS.IN_PROGRESS;

const { calculateAvailableSlots } = require('../../utils/availability.utils');

const toCustomerId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
    return null;
  }
  return String(value);
};

const isValidObjectIdString = (value) => {
  const normalized = String(value || '').trim();
  return mongoose.Types.ObjectId.isValid(normalized);
};

const normalizeTicketId = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '#N/A';
  return normalized.startsWith('#') ? normalized : `#${normalized}`;
};

const mapTeamMembers = (members) => members.map((member) => ({
  fullName: member.fullName || 'Unknown Member',
  role: member.role || 'Technician'
}));

const mapActiveJob = (item, type) => ({
  id: item._id,
  ticketId: normalizeTicketId(item.ticketId || String(item._id).slice(-4).toUpperCase()),
  fullName: item.customerId?.fullName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
  location: item.customerId?.address || item.location || '-',
  type,
  date: item.serviceDate || item.date || item.createdAt || null
});

const isActiveJob = (item) => activeStatuses.includes(String(item.status || ''));
const isInProgressJob = (item) => String(item.status || '') === inProgressStatus;
const getAssignedTeamKey = (item) => String(item.assignedTeam || item.assignedTeamId || '');

const buildInspectionTeamResolver = (teams, fallbackTeamId = '') => {
  const inspectionTeams = teams.filter((team) => String(team.teamType || '') === 'Inspection Team');
  const nameToId = new Map(
    inspectionTeams
      .map((team) => [String(team.teamName || '').trim().toLowerCase(), String(team._id)])
      .filter(([fullName]) => Boolean(fullName))
  );

  const singleInspectionTeamId = inspectionTeams.length === 1 ? String(inspectionTeams[0]._id) : '';

  return (item) => {
    const directKey = getAssignedTeamKey(item);
    if (directKey) {
      return directKey;
    }

    const candidateNames = [
      item?.assignedTeamName,
      item?.teamName,
      item?.inspectionMeta?.team
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);

    for (const candidate of candidateNames) {
      const mappedId = nameToId.get(candidate);
      if (mappedId) {
        return mappedId;
      }
    }

    return fallbackTeamId || singleInspectionTeamId || '';
  };
};

const loadTeamMembers = async (teamIds) => {
  if (teamIds.length === 0) {
    return [];
  }

  const members = await TechTeamMember.collection.find().toArray();
  const teamIdSet = new Set(teamIds.map((teamId) => String(teamId)));

  return members.filter((member) => teamIdSet.has(String(member.teamId)));
};

exports.getAllTeamsWithMembers = async (req, res) => {
  try {
    const teams = await TechTeam.find().lean();
    const resolveInspectionTeamKey = buildInspectionTeamResolver(teams);
    const teamIds = teams.map((team) => team._id);
    const members = await loadTeamMembers(teamIds);

    const membersByTeamId = members.reduce((accumulator, member) => {
      const key = String(member.teamId);
      if (!accumulator.has(key)) {
        accumulator.set(key, []);
      }
      accumulator.get(key).push({
        fullName: member.fullName || 'Unknown Member',
        role: member.role || 'Technician'
      });
      return accumulator;
    }, new Map());

    const [serviceDocs, installationDocs, inspectionDocs, maintenanceDocs] = await Promise.all([
      ServiceRequest.collection.find().toArray(),
      Installation.collection.find().toArray(),
      Inspection.collection.find().toArray(),
      Maintenance.collection.find().toArray(),
    ]);

    const customerIds = Array.from(new Set([
      ...serviceDocs.map((item) => toCustomerId(item.customerId)),
      ...installationDocs.map((item) => toCustomerId(item.customerId)),
      ...inspectionDocs.map((item) => toCustomerId(item.customerId)),
      ...maintenanceDocs.map((item) => toCustomerId(item.customerId))
    ].filter((value) => value && isValidObjectIdString(value))));

    const customerDocs = customerIds.length > 0
      ? await Customer.find({ _id: { $in: customerIds } }).lean()
      : [];
    const customerById = new Map(customerDocs.map((customer) => [String(customer._id), customer]));

    const services = serviceDocs
      .filter((item) => isInProgressJob(item))
      .map((item) => ({
        ...item,
        customerId: customerById.get(String(item.customerId)) || item.customerId,
        assignedTeam: item.assignedTeam,
        assignedTeamId: item.assignedTeamId
      }));

    const installations = installationDocs
      .filter((item) => isInProgressJob(item))
      .map((item) => ({
        ...item,
        customerId: customerById.get(String(item.customerId)) || item.customerId,
        assignedTeam: item.assignedTeam,
        assignedTeamId: item.assignedTeamId
      }));

    const inspections = inspectionDocs
      .filter((item) => isInProgressJob(item))
      .map((item) => ({
        ...item,
        customerId: customerById.get(String(item.customerId)) || item.customerId,
        assignedTeam: item.assignedTeam,
        assignedTeamId: item.assignedTeamId,
        _resolvedInspectionTeamId: resolveInspectionTeamKey(item)
      }));

    const maintenances = maintenanceDocs
      .filter((item) => isInProgressJob(item))
      .map((item) => ({
        ...item,
        customerId: customerById.get(String(item.customerId)) || item.customerId,
        assignedTeam: item.assignedTeam,
        assignedTeamId: item.assignedTeamId
      }));

    const jobsByTeamId = new Map();
    [
      ...services.map((item) => ({ ...item, type: REQUEST_TYPES.SERVICE })),
      ...installations.map((item) => ({ ...item, type: REQUEST_TYPES.INSTALLATION })),
      ...inspections.map((item) => ({ ...item, type: REQUEST_TYPES.INSPECTION })),
      ...maintenances.map((item) => ({ ...item, type: 'Maintenance' }))
    ]
      .forEach((item) => {
        const teamKey = item.type === REQUEST_TYPES.INSPECTION
          ? String(item._resolvedInspectionTeamId || '')
          : getAssignedTeamKey(item);
        if (!teamKey) {
          return;
        }

        if (!jobsByTeamId.has(teamKey)) {
          jobsByTeamId.set(teamKey, []);
        }

        jobsByTeamId.get(teamKey).push(mapActiveJob(item, item.type));
      });

    const serviceInstallWorkloadByTeamId = new Map();
    [...serviceDocs, ...installationDocs, ...maintenanceDocs]
      .filter((item) => isActiveJob(item))
      .forEach((item) => {
        const teamKey = getAssignedTeamKey(item);
        if (!teamKey) {
          return;
        }

        if (!serviceInstallWorkloadByTeamId.has(teamKey)) {
          serviceInstallWorkloadByTeamId.set(teamKey, []);
        }

        serviceInstallWorkloadByTeamId.get(teamKey).push(item);
      });

    const inspectionWorkloadByTeamId = new Map();
    inspectionDocs
      .filter((item) => isActiveJob(item))
      .forEach((item) => {
        const teamKey = resolveInspectionTeamKey(item);
        if (!teamKey) {
          return;
        }

        if (!inspectionWorkloadByTeamId.has(teamKey)) {
          inspectionWorkloadByTeamId.set(teamKey, []);
        }

        inspectionWorkloadByTeamId.get(teamKey).push(item);
      });

    const data = teams.map((team) => {
      const teamMembers = membersByTeamId.get(String(team._id)) || [];
      const activeJobs = jobsByTeamId.get(String(team._id)) || [];
      const teamWorkload = team.teamType === 'Inspection Team'
        ? (inspectionWorkloadByTeamId.get(String(team._id)) || [])
        : (serviceInstallWorkloadByTeamId.get(String(team._id)) || []);
      const availableSlots = (team.teamType === 'Service Team' || team.teamType === 'Inspection Team')
        ? calculateAvailableSlots(teamWorkload, { maxSlots: 4, includeToday: false })
        : [];
      const inProgressCount = activeJobs.length;
      const derivedStatus = inProgressCount > 0 ? TEAM_STATUS.BUSY : TEAM_STATUS.AVAILABLE;

      return {
        _id: team._id,
        teamName: team.teamName,
        teamType: team.teamType,
        status: derivedStatus,
        activeJobsCount: inProgressCount,
        availableSlots: availableSlots.map((slot) => slot.toISOString()),
        members: teamMembers,
        activeJobs
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      code: err.code || 'TEAM_LIST_FAILED',
      error: err.message,
    });
  }
};

exports.getPendingAssignments = async (req, res) => {
  try {
    const [serviceRequests, installations, inspections, maintenances] = await Promise.all([
      ServiceRequest.find({ status: WORKFLOW_STATUS.MATERIALS_READY })
        .populate('customerId', 'fullName name address')
        .lean(),
      Installation.find({ status: WORKFLOW_STATUS.MATERIALS_READY })
        .populate('customerId', 'fullName name address')
        .lean(),
      // Include inspections that have been approved by Finance and are pending assignment
      Inspection.find({ status: WORKFLOW_STATUS.FINANCE_APPROVED })
        .populate('customerId', 'fullName name address')
        .lean(),
      Maintenance.find({ status: MAINTENANCE_STATUS.MATERIALS_READY })
        .populate('customerId', 'fullName name address')
        .lean()
    ]);

    const materialJobIds = [...serviceRequests, ...installations, ...maintenances].map(item => item._id);
    const reservedRequests = materialJobIds.length
      ? await WarehousePickRequest.find({ jobId: { $in: materialJobIds }, status: 'reserved' })
        .select('jobId statusVersion').lean()
      : [];
    const warehouseByJob = new Map(reservedRequests.map(request => [String(request.jobId), request]));

    const data = [
      ...serviceRequests.filter(item => warehouseByJob.has(String(item._id))).map((item) => ({
        _id: item._id,
        ticketId: normalizeTicketId(item.ticketId || item._id),
        fullName: item.customerId?.fullName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
        location: item.customerId?.address || item.location || '-',
        requestType: REQUEST_TYPES.SERVICE,
        productType: item.productType || '-',
        warehouseStatusVersion: warehouseByJob.get(String(item._id)).statusVersion,
      })),
      ...installations.filter(item => warehouseByJob.has(String(item._id))).map((item) => ({
        _id: item._id,
        ticketId: normalizeTicketId(item.ticketId || item._id),
        fullName: item.customerId?.fullName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
        location: item.customerId?.address || item.location || '-',
        requestType: REQUEST_TYPES.INSTALLATION,
        productType: item.productType || '-',
        warehouseStatusVersion: warehouseByJob.get(String(item._id)).statusVersion,
      })),
      // Treat inspections as a pending job type so they appear in the assign modal
      ...inspections.map((item) => ({
        _id: item._id,
        ticketId: normalizeTicketId(item.ticketId || item._id),
        fullName: item.customerId?.fullName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
        location: item.customerId?.address || item.location || '-',
        requestType: REQUEST_TYPES.INSPECTION,
        productType: item.productType || '-'
      })),
      ...maintenances.filter(item => warehouseByJob.has(String(item._id))).map((item) => ({
        _id: item._id,
        ticketId: normalizeTicketId(item.ticketId || item._id),
        fullName: item.customerId?.fullName || item.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
        location: item.customerId?.address || item.location || '-',
        requestType: 'Maintenance',
        productType: item.productType || 'Customer Initiated',
        warehouseStatusVersion: warehouseByJob.get(String(item._id)).statusVersion,
      }))
    ];

    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.assignServiceRequestToTeam = async (req, res) => {
  try {
    const { serviceRequestId, teamId, requestType, warehouseStatusVersion } = req.body || {};
    logger.debug('assignServiceRequestToTeam called with', { serviceRequestId, teamId, requestType });
    const resolvedServiceRequestId = String(serviceRequestId || '').replace(/^#/, '').trim();
    
    // Parse teamId to number if numeric, as test DB uses numeric IDs
    const resolvedTeamIdStr = String(teamId || '').trim();
    const resolvedTeamId = !isNaN(Number(resolvedTeamIdStr)) ? Number(resolvedTeamIdStr) : resolvedTeamIdStr;

    if (!mongoose.Types.ObjectId.isValid(resolvedServiceRequestId)) {
      return res.status(400).json({ success: false, error: 'Invalid serviceRequestId.' });
    }

    if (!resolvedTeamId) {
      return res.status(400).json({ success: false, error: 'Invalid teamId.' });
    }

    const team = await TechTeam.findById(resolvedTeamId).lean();
    logger.debug('Resolved team', team ? { id: team._id, fullName: team.teamName } : null);
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const normalizedRequestType = String(requestType || '').toLowerCase();
    const isInstallation = normalizedRequestType === REQUEST_TYPES.INSTALLATION.toLowerCase();
    const isInspection = normalizedRequestType === REQUEST_TYPES.INSPECTION.toLowerCase() || normalizedRequestType === 'inspection';
    const isMaintenance = normalizedRequestType === 'maintenance';
    
    let Model = ServiceRequest;
    let targetStatus = EXECUTION_STATUS.ASSIGNED;
    
    if (isInstallation) {
      Model = Installation;
    } else if (isMaintenance) {
      Model = Maintenance;
      targetStatus = MAINTENANCE_STATUS.ASSIGNED;
    } else if (isInspection) {
      Model = Inspection;
      targetStatus = EXECUTION_STATUS.ASSIGNED;
    }

    // assignedTeam must be an ObjectId reference; some teams use numeric _id.
    // Use the original incoming `teamId` string to decide whether an ObjectId
    // should be set. Only set `assignedTeam` when the provided `teamId` is a
    // 24-character hex string (typical Mongo ObjectId). This avoids trying to
    // write numeric IDs into ObjectId fields (which causes BSON cast errors).
    const isObjectIdHex = /^[a-fA-F0-9]{24}$/.test(String(resolvedTeamIdStr));
    const assignedTeamFieldName = isInstallation ? 'assignedTeamRef' : 'assignedTeam';
    const updatePayload = {
      ...(isObjectIdHex ? { [assignedTeamFieldName]: mongoose.Types.ObjectId(String(resolvedTeamIdStr)) } : {}),
      assignedTeamId: team._id,
      assignedTeamName: team.teamName,
      status: targetStatus
    };

    const warehouseJobType = isInstallation ? 'Installation' : isMaintenance ? 'Maintenance' : 'Repair';
    const warehouseRequest = isInspection ? null : await WarehousePickRequest.findOne({
      jobId: resolvedServiceRequestId,
      jobType: warehouseJobType,
      status: 'reserved',
    });
    if (!isInspection && !warehouseRequest) {
      return res.status(409).json({
        success: false,
        code: 'MATERIALS_NOT_RESERVED',
        error: 'The complete material kit must be reserved before assigning a service team.',
      });
    }
    if (warehouseRequest && warehouseStatusVersion !== undefined
      && Number(warehouseStatusVersion) !== Number(warehouseRequest.statusVersion)) {
      return res.status(409).json({
        success: false,
        code: 'STALE_MATERIAL_REQUEST',
        error: 'The material request changed; reload before assigning a team.',
      });
    }

    logger.debug('assignServiceRequestToTeam: isObjectIdHex', { isObjectIdHex, resolvedTeamIdStr });

    logger.debug('Updating model', { model: Model.modelName, id: resolvedServiceRequestId, payload: updatePayload });
    let assignment;
    try {
      // Use the raw collection update to avoid Mongoose casting errors when
      // document schemas expect ObjectId but the environment stores numeric
      // team IDs. This performs a direct MongoDB update.
      const filter = { _id: mongoose.Types.ObjectId(resolvedServiceRequestId) };
      await mongoose.connection.transaction(async session => {
        const currentStatus = isInspection ? WORKFLOW_STATUS.FINANCE_APPROVED : WORKFLOW_STATUS.MATERIALS_READY;
        const resUpdate = await Model.collection.updateOne({ ...filter, status: currentStatus }, { $set: updatePayload }, { session });
        if (resUpdate.matchedCount === 0) {
          const error = new Error('The job is no longer ready for team assignment.');
          error.statusCode = 409;
          error.code = 'INVALID_ASSIGNMENT_TRANSITION';
          throw error;
        }
        logger.debug('Raw update result', { result: resUpdate && resUpdate.result ? resUpdate.result : resUpdate });
        if (warehouseRequest) {
          const warehouseUpdate = await WarehousePickRequest.updateOne({
            _id: warehouseRequest._id,
            status: 'reserved',
            statusVersion: warehouseRequest.statusVersion,
            assignedTeamId: { $exists: false },
          }, {
            $set: { assignedTeamId: team._id, assignedTeamName: team.teamName },
            $inc: { statusVersion: 1 },
          }, { session, runValidators: true });
          if (warehouseUpdate.matchedCount === 0) {
            const error = new Error('The material reservation changed or already has a team.');
            error.statusCode = 409;
            error.code = 'STALE_MATERIAL_REQUEST';
            throw error;
          }
        }
        await TechTeam.updateOne({ _id: team._id }, {
          $inc: { activeJobsCount: 1 },
          $set: { status: 'On Job' },
        }, { session, runValidators: true });
      });
      assignment = await Model.findById(resolvedServiceRequestId).lean();
      logger.debug('Assignment result (fetched)', { assignment: assignment ? { _id: assignment._id, status: assignment.status } : null });
    } catch (updateErr) {
      logger.error('Error performing raw update', updateErr && updateErr.message ? updateErr.message : updateErr);
      throw updateErr;
    }

    if (!assignment) {
      const notFoundType = isInstallation ? 'Installation' : isMaintenance ? 'Maintenance' : isInspection ? 'Inspection' : 'Service request';
      return res.status(404).json({ success: false, error: `${notFoundType} not found.` });
    }

    res.json({
      success: true,
      message: `${isInspection ? 'Inspection' : isInstallation ? 'Installation' : isMaintenance ? 'Maintenance' : 'Service request'} assigned successfully.`
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({
      success: false,
      code: err.code || 'TEAM_ASSIGNMENT_FAILED',
      error: err.message,
    });
  }
};

exports.getTeamScheduleDetails = async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({ success: false, message: 'Invalid teamId' });
    }

    // 1. Fetch team and members
    const team = await TechTeam.findById(teamId).lean();
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

    const allTeams = await TechTeam.find().lean();
    const resolveInspectionTeamKey = buildInspectionTeamResolver(allTeams, String(team._id));

    const members = (await TechTeamMember.collection.find().toArray())
      .filter((member) => String(member.teamId) === String(team._id));

    // 2. Fetch all active jobs for this team across both types
    const [serviceDocs, installationDocs, inspectionDocs, maintenanceDocs] = await Promise.all([
      ServiceRequest.collection.find().toArray(),
      Installation.collection.find().toArray(),
      Inspection.collection.find().toArray(),
      Maintenance.collection.find().toArray()
    ]);

    const customerIds = Array.from(new Set([
      ...serviceDocs.map((item) => toCustomerId(item.customerId)),
      ...installationDocs.map((item) => toCustomerId(item.customerId)),
      ...inspectionDocs.map((item) => toCustomerId(item.customerId)),
      ...maintenanceDocs.map((item) => toCustomerId(item.customerId))
    ].filter((value) => value && isValidObjectIdString(value))));

    const customerDocs = customerIds.length > 0
      ? await Customer.find({ _id: { $in: customerIds } }).lean()
      : [];
    const customerById = new Map(customerDocs.map((customer) => [String(customer._id), customer]));

    let activeJobs = [];
    let teamWorkload = [];

    if (team.teamType === 'Inspection Team') {
      const inspections = inspectionDocs.filter((item) => {
        const assignedTeam = resolveInspectionTeamKey(item);
        return assignedTeam === String(team._id) && isActiveJob(item);
      }).map((item) => ({
        ...item,
        customerId: customerById.get(String(item.customerId)) || item.customerId
      }));

      activeJobs = inspections.map((item) => ({
        id: item._id,
        ticketId: `#${String(item._id).slice(-4).toUpperCase()}`,
        fullName: item.customerId?.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
        location: item.customerId?.address || item.location || '-',
        type: REQUEST_TYPES.INSPECTION,
        date: item.serviceDate || item.date
      })).sort((a, b) => new Date(a.date) - new Date(b.date));

      teamWorkload = inspections;
    } else {
      const services = serviceDocs.filter((item) => {
        const assignedTeam = getAssignedTeamKey(item);
        return assignedTeam === String(team._id) && isActiveJob(item);
      }).map((item) => ({
        ...item,
        customerId: customerById.get(String(item.customerId)) || item.customerId
      }));

      const installations = installationDocs.filter((item) => {
        const assignedTeam = getAssignedTeamKey(item);
        return assignedTeam === String(team._id) && isActiveJob(item);
      }).map((item) => ({
        ...item,
        customerId: customerById.get(String(item.customerId)) || item.customerId
      }));

      const maintenances = maintenanceDocs.filter((item) => {
        const assignedTeam = getAssignedTeamKey(item);
        return assignedTeam === String(team._id) && isActiveJob(item);
      }).map((item) => ({
        ...item,
        customerId: customerById.get(String(item.customerId)) || item.customerId
      }));

      activeJobs = [
        ...services.map((item) => ({
          id: item._id,
          ticketId: `#${String(item._id).slice(-4).toUpperCase()}`,
          fullName: item.customerId?.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
          location: item.customerId?.address || item.location || '-',
          type: REQUEST_TYPES.SERVICE,
          date: item.serviceDate || item.date
        })),
        ...installations.map((item) => ({
          id: item._id,
          ticketId: `#${String(item._id).slice(-4).toUpperCase()}`,
          fullName: item.customerId?.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
          location: item.customerId?.address || item.location || '-',
          type: REQUEST_TYPES.INSTALLATION,
          date: item.date || item.serviceDate
        })),
        ...maintenances.map((item) => ({
          id: item._id,
          ticketId: `#${String(item._id).slice(-4).toUpperCase()}`,
          fullName: item.customerId?.fullName || DEFAULTS.UNKNOWN_CUSTOMER,
          location: item.customerId?.address || item.location || '-',
          type: 'Maintenance',
          date: item.date || item.serviceDate
        }))
      ].sort((a, b) => new Date(a.date) - new Date(b.date));

      teamWorkload = [...services, ...installations, ...maintenances];
    }

    // 4. Calculate next available future slots for this specific team.
    const availableSlots = calculateAvailableSlots(teamWorkload, { maxSlots: 4, includeToday: false })
      .map((date) => ({
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        date: date.toLocaleDateString('en-US', { day: 'numeric', month: 'long' }),
        raw: date
      }));

    res.json({
      success: true,
      data: {
        teamName: team.teamName,
        members,
        activeJobsCount: activeJobs.length,
        activeJobs,
        availableSlots
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};



