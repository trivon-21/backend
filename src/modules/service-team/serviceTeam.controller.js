// src/controllers/techTeam.controller.js
const TechTeam = require('./serviceTeam.model');
const TechTeamMember = require('./serviceTeamMember.model');
const Customer = require('../customer/customer.model');
const ServiceRequest = require('../shared/serviceRequest/ServiceRequest');
const Installation = require('../shared/installation/Installation');
const Inspection = require('../shared/inspection/Inspection');
const mongoose = require('mongoose');

const activeStatuses = ['Assigned', 'Scheduled', 'In Progress', 'On Hold'];
const inProgressStatus = 'In Progress';

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
  name: member.name || 'Unknown Member',
  role: member.role || 'Technician'
}));

const mapActiveJob = (item, type) => ({
  id: item._id,
  ticketId: normalizeTicketId(item.ticketId || String(item._id).slice(-4).toUpperCase()),
  customerName: item.customerId?.name || item.customerName || 'Unknown',
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
      .filter(([name]) => Boolean(name))
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
        name: member.name || 'Unknown Member',
        role: member.role || 'Technician'
      });
      return accumulator;
    }, new Map());

    const [serviceDocs, installationDocs, inspectionDocs] = await Promise.all([
      ServiceRequest.collection.find().toArray(),
      Installation.collection.find().toArray(),
      Inspection.collection.find().toArray(),
    ]);

    const customerIds = Array.from(new Set([
      ...serviceDocs.map((item) => toCustomerId(item.customerId)),
      ...installationDocs.map((item) => toCustomerId(item.customerId)),
      ...inspectionDocs.map((item) => toCustomerId(item.customerId))
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

    const jobsByTeamId = new Map();
    [
      ...services.map((item) => ({ ...item, type: 'Service' })),
      ...installations.map((item) => ({ ...item, type: 'Installation' })),
      ...inspections.map((item) => ({ ...item, type: 'Inspection' }))
    ]
      .forEach((item) => {
        const teamKey = item.type === 'Inspection'
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
    [...serviceDocs, ...installationDocs]
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
      const derivedStatus = inProgressCount > 0 ? 'Busy' : 'Available';

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
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getPendingAssignments = async (req, res) => {
  try {
    const [serviceRequests, installations] = await Promise.all([
      ServiceRequest.find({ status: 'Sent to IM' })
        .populate('customerId', 'name address')
        .lean(),
      Installation.find({ status: 'Sent to IM' })
        .populate('customerId', 'name address')
        .lean()
    ]);

    const data = [
      ...serviceRequests.map((item) => ({
        _id: item._id,
        ticketId: normalizeTicketId(item.ticketId || item._id),
        customerName: item.customerId?.name || item.customerName || 'Unknown Customer',
        location: item.customerId?.address || item.location || '-',
        requestType: 'Service',
        productType: item.productType || '-'
      })),
      ...installations.map((item) => ({
        _id: item._id,
        ticketId: normalizeTicketId(item.ticketId || item._id),
        customerName: item.customerId?.name || item.customerName || 'Unknown Customer',
        location: item.customerId?.address || item.location || '-',
        requestType: 'Installation',
        productType: item.productType || '-'
      }))
    ];

    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.assignServiceRequestToTeam = async (req, res) => {
  try {
    const { serviceRequestId, teamId, requestType } = req.body || {};
    const resolvedServiceRequestId = String(serviceRequestId || '').replace(/^#/, '').trim();
    const resolvedTeamId = String(teamId || '').trim();

    if (!mongoose.Types.ObjectId.isValid(resolvedServiceRequestId)) {
      return res.status(400).json({ success: false, error: 'Invalid serviceRequestId.' });
    }

    if (!mongoose.Types.ObjectId.isValid(resolvedTeamId)) {
      return res.status(400).json({ success: false, error: 'Invalid teamId.' });
    }

    const team = await TechTeam.findById(resolvedTeamId).lean();
    if (!team) {
      return res.status(404).json({ success: false, error: 'Team not found.' });
    }

    const normalizedRequestType = String(requestType || '').toLowerCase();
    const isInstallation = normalizedRequestType === 'installation';
    const Model = isInstallation ? Installation : ServiceRequest;
    const assignment = await Model.findByIdAndUpdate(
      resolvedServiceRequestId,
      {
        assignedTeam: team._id,
        assignedTeamId: team._id,
        assignedTeamName: team.teamName,
        status: 'Assigned'
      },
      { new: true }
    );

    if (!assignment) {
      return res.status(404).json({ success: false, error: `${isInstallation ? 'Installation' : 'Service request'} not found.` });
    }

    const currentActiveJobsCount = Number(team.activeJobsCount || 0);
    await TechTeam.findByIdAndUpdate(resolvedTeamId, {
      activeJobsCount: currentActiveJobsCount + 1,
      status: 'Busy'
    });

    res.json({
      success: true,
      message: `${isInstallation ? 'Installation' : 'Service request'} assigned successfully.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
    const [serviceDocs, installationDocs, inspectionDocs] = await Promise.all([
      ServiceRequest.collection.find().toArray(),
      Installation.collection.find().toArray(),
      Inspection.collection.find().toArray()
    ]);

    const customerIds = Array.from(new Set([
      ...serviceDocs.map((item) => toCustomerId(item.customerId)),
      ...installationDocs.map((item) => toCustomerId(item.customerId)),
      ...inspectionDocs.map((item) => toCustomerId(item.customerId))
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
        customerName: item.customerId?.name || 'Unknown',
        location: item.customerId?.address || item.location || '-',
        type: 'Inspection',
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

      activeJobs = [
        ...services.map((item) => ({
          id: item._id,
          ticketId: `#${String(item._id).slice(-4).toUpperCase()}`,
          customerName: item.customerId?.name || 'Unknown',
          location: item.customerId?.address || item.location || '-',
          type: 'Service',
          date: item.serviceDate || item.date
        })),
        ...installations.map((item) => ({
          id: item._id,
          ticketId: `#${String(item._id).slice(-4).toUpperCase()}`,
          customerName: item.customerId?.name || 'Unknown',
          location: item.customerId?.address || item.location || '-',
          type: 'Installation',
          date: item.date || item.serviceDate
        }))
      ].sort((a, b) => new Date(a.date) - new Date(b.date));

      teamWorkload = [...services, ...installations];
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