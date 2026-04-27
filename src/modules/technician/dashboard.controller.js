const InspectionReport = require('../inspection-team/inspection.model');
const Inspection = require('../shared/inspection/Inspection');
const Installation = require('../shared/installation/Installation');
const ServiceRequest = require('../shared/serviceRequest/ServiceRequest');
const ServiceTeam = require('../service-team/serviceTeam.model');
const Customer = require('../customer/customer.model');
const serviceTeamDashboardController = require('../service-team/dashboard.controller');
const { WORKFLOW_STATUS, EXECUTION_STATUS, DEFAULTS } = require('../../constants/enums');

const DASHBOARD_LIMITS = {
  DEFAULT_ACTIVITY_LIMIT: 5,
  MAX_ACTIVITY_LIMIT: 20,
  ALERT_LIMIT: 5,
};

const TEAM_TYPES = {
  INSPECTION: 'Inspection Team',
};

const ACTIVITY_TYPES = {
  INSPECTION: 'inspection',
  INSTALLATION: 'installation',
  SERVICE: 'service',
};

const ALERTS = {
  MATERIAL_TYPE: 'material',
  REVIEW_ACTION: 'Review',
};

const parseActivityLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DASHBOARD_LIMITS.DEFAULT_ACTIVITY_LIMIT;
  }

  return Math.min(Math.floor(parsed), DASHBOARD_LIMITS.MAX_ACTIVITY_LIMIT);
};

const getCustomerIdFromRecord = (record) => {
  const value = record?.customerId;
  if (!value) return '';

  if (typeof value === 'string') return value;

  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
  }

  return String(value);
};

const loadCustomerNameMap = async (records) => {
  const customerIds = Array.from(new Set(
    records
      .map(getCustomerIdFromRecord)
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  ));

  if (customerIds.length === 0) {
    return new Map();
  }

  const customers = await Customer.find({ _id: { $in: customerIds } }).select('_id name').lean();
  return new Map(customers.map((customer) => [String(customer._id), customer.name || DEFAULTS.UNKNOWN_CUSTOMER]));
};

const resolveCustomerName = (record, customerNameMap) => {
  const customerId = getCustomerIdFromRecord(record);
  if (customerId && customerNameMap.has(customerId)) {
    return customerNameMap.get(customerId);
  }

  const embeddedName = record?.customerId?.name;
  if (embeddedName) {
    return embeddedName;
  }

  return DEFAULTS.UNKNOWN_CUSTOMER;
};

const getAssignedTeamKey = (item) => String(item?.assignedTeamId || item?.assignedTeam || '').trim();

const buildInspectionTeamResolver = (teams) => {
  const inspectionTeams = teams.filter((team) => String(team.teamType || '') === TEAM_TYPES.INSPECTION);
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

    const candidateNames = [item?.assignedTeamName, item?.teamName, item?.inspectionMeta?.team]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);

    for (const candidate of candidateNames) {
      const mappedId = nameToId.get(candidate);
      if (mappedId) {
        return mappedId;
      }
    }

    return singleInspectionTeamId;
  };
};

exports.getDashboardSummary = async (req, res) => {
  if (req?.query?.teamName) {
    return serviceTeamDashboardController.getDashboardSummary(req, res);
  }

  try {
    const [
      pendingReviews,
      inProgressInstallations,
      inProgressServices,
      teams,
      serviceAssignments,
      installationAssignments,
      inspectionAssignments,
    ] = await Promise.all([
      InspectionReport.countDocuments({ status: WORKFLOW_STATUS.PENDING }),
      Installation.countDocuments({ status: EXECUTION_STATUS.IN_PROGRESS }),
      ServiceRequest.countDocuments({ status: EXECUTION_STATUS.IN_PROGRESS }),
      ServiceTeam.find().select('_id teamType teamName').lean(),
      ServiceRequest.find({ status: EXECUTION_STATUS.IN_PROGRESS }).select('assignedTeam assignedTeamId').lean(),
      Installation.find({ status: EXECUTION_STATUS.IN_PROGRESS }).select('assignedTeam assignedTeamId').lean(),
      Inspection.find({ status: EXECUTION_STATUS.IN_PROGRESS })
        .select('assignedTeam assignedTeamId assignedTeamName teamName inspectionMeta.team')
        .lean(),
    ]);

    const teamIdSet = new Set(teams.map((team) => String(team._id)));
    const resolveInspectionTeamKey = buildInspectionTeamResolver(teams);
    const busyTeamIdSet = new Set();

    const collectBusyTeamIds = (assignments) => {
      assignments.forEach((item) => {
        const candidates = [item.assignedTeamId, item.assignedTeam];
        candidates.forEach((candidate) => {
          if (!candidate) return;
          const normalized = String(candidate);
          if (teamIdSet.has(normalized)) {
            busyTeamIdSet.add(normalized);
          }
        });
      });
    };

    const collectInspectionBusyTeamIds = (assignments) => {
      assignments.forEach((item) => {
        const normalized = resolveInspectionTeamKey(item);
        if (normalized && teamIdSet.has(normalized)) {
          busyTeamIdSet.add(normalized);
        }
      });
    };

    collectBusyTeamIds(serviceAssignments);
    collectBusyTeamIds(installationAssignments);
    collectInspectionBusyTeamIds(inspectionAssignments);

    const teamsAvailable = Math.max(0, teams.length - busyTeamIdSet.size);

    res.json({
      success: true,
      data: {
        pendingReviews,
        activeJobs: inProgressInstallations + inProgressServices,
        serviceRequests: inProgressServices,
        teamAvailable: teamsAvailable,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getRecentActivity = async (req, res) => {
  if (req?.query?.teamName) {
    return serviceTeamDashboardController.getRecentActivity(req, res);
  }

  try {
    const limit = parseActivityLimit(req.query.limit);

    const [recentInspectionReports, recentInstallations, recentServiceRequests] = await Promise.all([
      InspectionReport.find().sort({ updatedAt: -1 }).limit(limit).lean(),
      Installation.find().sort({ updatedAt: -1 }).limit(limit).lean(),
      ServiceRequest.find().sort({ createdAt: -1 }).limit(limit).lean(),
    ]);

    const customerNameMap = await loadCustomerNameMap([
      ...recentInspectionReports,
      ...recentInstallations,
      ...recentServiceRequests,
    ]);

    const activities = [];

    recentInspectionReports.forEach((item) => {
      const customerName = resolveCustomerName(item, customerNameMap);
      activities.push({
        type: ACTIVITY_TYPES.INSPECTION,
        id: item._id,
        title: `New Inspection Report - ${customerName}`,
        timestamp: item.updatedAt,
        icon: ACTIVITY_TYPES.INSPECTION,
      });
    });

    recentInstallations.forEach((item) => {
      const customerName = resolveCustomerName(item, customerNameMap);
      activities.push({
        type: ACTIVITY_TYPES.INSTALLATION,
        id: item._id,
        title: `Installation Progress Update - ${customerName}`,
        timestamp: item.updatedAt,
        icon: ACTIVITY_TYPES.INSTALLATION,
      });
    });

    recentServiceRequests.forEach((item) => {
      const customerName = resolveCustomerName(item, customerNameMap);
      activities.push({
        type: ACTIVITY_TYPES.SERVICE,
        id: item._id,
        title: `Service Request Update - ${customerName}`,
        timestamp: item.createdAt,
        icon: ACTIVITY_TYPES.SERVICE,
      });
    });

    const data = activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getUrgentAlerts = async (req, res) => {
  if (req?.query?.teamName) {
    return serviceTeamDashboardController.getUrgentAlerts(req, res);
  }

  try {
    const stockAlertStatuses = [
      WORKFLOW_STATUS.NEW,
      WORKFLOW_STATUS.FINANCE_APPROVED,
      WORKFLOW_STATUS.FINANCE_REJECTED,
    ];

    const [installationAlerts, serviceAlerts] = await Promise.all([
      Installation.find({ status: { $in: stockAlertStatuses } })
        .select('_id status ticketId updatedAt createdAt')
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(DASHBOARD_LIMITS.ALERT_LIMIT)
        .lean(),
      ServiceRequest.find({ status: { $in: stockAlertStatuses } })
        .select('_id status ticketId updatedAt createdAt')
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(DASHBOARD_LIMITS.ALERT_LIMIT)
        .lean(),
    ]);

    const mergedAlerts = [
      ...installationAlerts.map((item) => ({
        ...item,
        source: ACTIVITY_TYPES.INSTALLATION,
        timestamp: item.updatedAt || item.createdAt,
      })),
      ...serviceAlerts.map((item) => ({
        ...item,
        source: ACTIVITY_TYPES.SERVICE,
        timestamp: item.updatedAt || item.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, DASHBOARD_LIMITS.ALERT_LIMIT);

    const alerts = mergedAlerts.map((item) => ({
      type: ALERTS.MATERIAL_TYPE,
      id: item._id,
      title: `${item.source === ACTIVITY_TYPES.INSTALLATION ? 'Installation' : 'Service Request'} - ${item.status}`,
      subtitle: `Reference: ${item.ticketId ? `#${item.ticketId}` : String(item._id).slice(-6).toUpperCase()}`,
      action: ALERTS.REVIEW_ACTION,
      urgent: true,
    }));

    res.json({ success: true, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
