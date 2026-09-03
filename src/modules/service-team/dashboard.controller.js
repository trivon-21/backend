const Installation = require('../shared/installation/installation.model');
const ServiceRequest = require('../shared/repair/repair.model');
const Maintenance = require('../shared/maintenance/maintenance.model');
const TechTeam = require('../shared/tech-teams/techTeam.model');
const { DEFAULT_TEAM_NAME } = require('../../config/app.config');
const {
  getRequestedTeamName,
  matchesJobTeam,
  matchesTeamName,
} = require('../../utils/team.utils');
const {
  WORKFLOW_STATUS,
  EXECUTION_STATUS,
  TEAM_STATUS,
  REQUEST_TYPES,
} = require('../../constants/enums');


/**
 * Coerces a query value into a safe list limit.
 * We clamp the range to avoid expensive scans from malformed inputs.
 * @param {unknown} value
 * @returns {number}
 */
const parseActivityLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 5;
  }

  return Math.min(Math.floor(parsed), 20);
};

/**
 * Normalizes status-like values for safe comparisons.
 * @param {unknown} value
 * @returns {string}
 */
const normalize = (value) => String(value || '').trim().toLowerCase();
const NORMALIZED_STATUS = {
  ASSIGNED: normalize(EXECUTION_STATUS.ASSIGNED),
  SCHEDULED: normalize(EXECUTION_STATUS.SCHEDULED),
  PENDING: normalize(WORKFLOW_STATUS.PENDING),
  FINANCE_APPROVED: normalize(WORKFLOW_STATUS.FINANCE_APPROVED),
  SENT_TO_IM: normalize(WORKFLOW_STATUS.SENT_TO_IM),
  IN_PROGRESS: normalize(EXECUTION_STATUS.IN_PROGRESS),
  COMPLETED: normalize(EXECUTION_STATUS.COMPLETED),
};

const STATUS_PRIORITY = new Map([
  [NORMALIZED_STATUS.IN_PROGRESS, 1],
  [NORMALIZED_STATUS.ASSIGNED, 2],
  [NORMALIZED_STATUS.SCHEDULED, 3],
  [NORMALIZED_STATUS.PENDING, 4],
  [NORMALIZED_STATUS.FINANCE_APPROVED, 5],
  [NORMALIZED_STATUS.SENT_TO_IM, 6],
  [NORMALIZED_STATUS.COMPLETED, 7],
]);

const JOB_TYPE = {
  SERVICE: REQUEST_TYPES.SERVICE.toLowerCase(),
  INSTALLATION: REQUEST_TYPES.INSTALLATION.toLowerCase(),
  MAINTENANCE: 'maintenance',
};

/**
 * GET: Dashboard summary - counts of active jobs, service requests, installations, and maintenances
 */
exports.getDashboardSummary = async (req, res) => {
  try {
    const requestedTeamName = getRequestedTeamName(req, DEFAULT_TEAM_NAME);
    
    const { resolveTeam, normalizeTeamName } = require('../../utils/team.utils');
    const team = await resolveTeam(requestedTeamName);

    if (!team) {
      return res.json({ success: true, data: { activeJobs: 0, serviceRequests: 0, installations: 0, maintenances: 0, inProgressServiceRequests: 0, inProgressInstallations: 0, inProgressMaintenances: 0 } });
    }

    const normalized = normalizeTeamName(requestedTeamName);

    const teamIdStr = String(team._id);
    const mongoose = require('mongoose');
    const teamIdObj = mongoose.Types.ObjectId.isValid(teamIdStr) ? new mongoose.Types.ObjectId(teamIdStr) : teamIdStr;
    const teamNamePattern = new RegExp(`^${normalized}$`, 'i');
    const fullNamePattern = new RegExp(`^${team.fullName?.trim()?.toLowerCase()}$`, 'i');

    const query = {
      $or: [
        { assignedTeamId: teamIdObj },
        { assignedTeamId: teamIdStr },
        { assignedTeamName: { $regex: teamNamePattern } },
        { assignedTeam: { $regex: teamNamePattern } },
        { teamName: { $regex: teamNamePattern } },
        { assignedTo: { $regex: teamNamePattern } },
        ...(team.fullName ? [
          { assignedTeamName: { $regex: fullNamePattern } },
          { assignedTeam: { $regex: fullNamePattern } },
          { teamName: { $regex: fullNamePattern } },
          { assignedTo: { $regex: fullNamePattern } }
        ] : [])
      ]
    };

    const [teamInstallations, teamServiceRequests, teamMaintenances] = await Promise.all([
      Installation.find(query).lean(),
      ServiceRequest.find(query).lean(),
      Maintenance.find(query).lean(),
    ]);

    const assignedStageStatuses = new Set([
      NORMALIZED_STATUS.ASSIGNED,
      NORMALIZED_STATUS.SCHEDULED,
      NORMALIZED_STATUS.PENDING,
      NORMALIZED_STATUS.FINANCE_APPROVED,
      NORMALIZED_STATUS.SENT_TO_IM,
    ]);

    const inProgressInstallations = teamInstallations.filter((item) => normalize(item.status) === NORMALIZED_STATUS.IN_PROGRESS).length;
    const inProgressServiceRequests = teamServiceRequests.filter((item) => normalize(item.status) === NORMALIZED_STATUS.IN_PROGRESS).length;
    const inProgressMaintenances = teamMaintenances.filter((item) => normalize(item.status) === NORMALIZED_STATUS.IN_PROGRESS).length;

    const assignedInstallations = teamInstallations.filter((item) => assignedStageStatuses.has(normalize(item.status))).length;
    const assignedServiceRequests = teamServiceRequests.filter((item) => assignedStageStatuses.has(normalize(item.status))).length;
    const assignedMaintenances = teamMaintenances.filter((item) => assignedStageStatuses.has(normalize(item.status))).length;

    const summary = {
      activeJobs: inProgressInstallations + inProgressServiceRequests + inProgressMaintenances,
      serviceRequests: assignedServiceRequests,
      installations: assignedInstallations,
      maintenances: assignedMaintenances,
      inProgressServiceRequests,
      inProgressInstallations,
      inProgressMaintenances,
    };

    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET: Recent activity feed - fetches the latest job activities
 */
exports.getRecentActivity = async (req, res) => {
  try {
    const requestedTeamName = getRequestedTeamName(req, DEFAULT_TEAM_NAME);
    const limit = parseActivityLimit(req.query.limit);

    const { resolveTeam, normalizeTeamName } = require('../../utils/team.utils');
    const team = await resolveTeam(requestedTeamName);

    if (!team) {
      return res.json({ success: true, data: [] });
    }

    const normalized = normalizeTeamName(requestedTeamName);

    const teamIdStr = String(team._id);
    const mongoose = require('mongoose');
    const teamIdObj = mongoose.Types.ObjectId.isValid(teamIdStr) ? new mongoose.Types.ObjectId(teamIdStr) : teamIdStr;
    const teamNamePattern = new RegExp(`^${normalized}$`, 'i');
    const fullNamePattern = new RegExp(`^${team.fullName?.trim()?.toLowerCase()}$`, 'i');

    const query = {
      $or: [
        { assignedTeamId: teamIdObj },
        { assignedTeamId: teamIdStr },
        { assignedTeamName: { $regex: teamNamePattern } },
        { assignedTeam: { $regex: teamNamePattern } },
        { teamName: { $regex: teamNamePattern } },
        { assignedTo: { $regex: teamNamePattern } },
        ...(team.fullName ? [
          { assignedTeamName: { $regex: fullNamePattern } },
          { assignedTeam: { $regex: fullNamePattern } },
          { teamName: { $regex: fullNamePattern } },
          { assignedTo: { $regex: fullNamePattern } }
        ] : [])
      ]
    };

    const [installs, requests, maintenances] = await Promise.all([
      Installation.find(query).lean(),
      ServiceRequest.find(query).lean(),
      Maintenance.find(query).lean(),
    ]);

    const teamInstallations = installs.map((job) => ({ ...job, _type: JOB_TYPE.INSTALLATION }));
    const teamServiceRequests = requests.map((job) => ({ ...job, _type: JOB_TYPE.SERVICE }));
    const teamMaintenances = maintenances.map((job) => ({ ...job, _type: JOB_TYPE.MAINTENANCE }));

    const grouped = new Map();
    [...teamInstallations, ...teamServiceRequests, ...teamMaintenances].forEach((job) => {
      const status = normalize(job.status) || NORMALIZED_STATUS.PENDING;
      const key = `${job._type}::${status}`;
      const timestamp = new Date(job.updatedAt || job.createdAt || 0).getTime();

      if (!grouped.has(key)) {
        grouped.set(key, {
          type: job._type,
          status,
          count: 0,
          latestTimestamp: timestamp,
        });
      }

      const current = grouped.get(key);
      current.count += 1;
      current.latestTimestamp = Math.max(current.latestTimestamp, timestamp);
    });

    const activityItems = Array.from(grouped.values())
      .sort((a, b) => {
        if (b.latestTimestamp !== a.latestTimestamp) {
          return b.latestTimestamp - a.latestTimestamp;
        }

        const aPriority = STATUS_PRIORITY.get(a.status) || Number.MAX_SAFE_INTEGER;
        const bPriority = STATUS_PRIORITY.get(b.status) || Number.MAX_SAFE_INTEGER;
        return aPriority - bPriority;
      })
      .map((entry) => {
        let noun = 'Jobs';
        if (entry.type === JOB_TYPE.INSTALLATION) noun = REQUEST_TYPES.INSTALLATION;
        else if (entry.type === JOB_TYPE.SERVICE) noun = 'Service Requests';
        else if (entry.type === JOB_TYPE.MAINTENANCE) noun = 'Maintenance Jobs';

        return {
          type: entry.type,
          title: `${noun} ${capitalize(entry.status)}: ${entry.count}`,
          timestamp: new Date(entry.latestTimestamp || Date.now()),
        };
      });

    const limited = activityItems.slice(0, limit);

    res.json({ success: true, data: limited });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET: Urgent alerts - generates alerts based on team and job status
 */
exports.getUrgentAlerts = async (req, res) => {
  try {
    const requestedTeamName = getRequestedTeamName(req, DEFAULT_TEAM_NAME);
    
    const { resolveTeam, normalizeTeamName } = require('../../utils/team.utils');
    const team = await resolveTeam(requestedTeamName);

    if (!team) {
      return res.json({ success: true, data: [{
        title: 'No Urgent Alerts',
        subtitle: 'All systems operating normally',
        action: 'Review',
        urgent: false
      }] });
    }

    const normalized = normalizeTeamName(requestedTeamName);

    const teamIdStr = String(team._id);
    const mongoose = require('mongoose');
    const teamIdObj = mongoose.Types.ObjectId.isValid(teamIdStr) ? new mongoose.Types.ObjectId(teamIdStr) : teamIdStr;
    const teamNamePattern = new RegExp(`^${normalized}$`, 'i');
    const fullNamePattern = new RegExp(`^${team.fullName?.trim()?.toLowerCase()}$`, 'i');

    const query = {
      $or: [
        { assignedTeamId: teamIdObj },
        { assignedTeamId: teamIdStr },
        { assignedTeamName: { $regex: teamNamePattern } },
        { assignedTeam: { $regex: teamNamePattern } },
        { teamName: { $regex: teamNamePattern } },
        { assignedTo: { $regex: teamNamePattern } },
        ...(team.fullName ? [
          { assignedTeamName: { $regex: fullNamePattern } },
          { assignedTeam: { $regex: fullNamePattern } },
          { teamName: { $regex: fullNamePattern } },
          { assignedTo: { $regex: fullNamePattern } }
        ] : [])
      ]
    };

    const [installs, requests, maintenances] = await Promise.all([
      Installation.find(query).lean(),
      ServiceRequest.find(query).lean(),
      Maintenance.find(query).lean()
    ]);

    const teamJobs = [...installs, ...requests, ...maintenances];
    const alerts = [];

    const inProgressCount = teamJobs.filter(j => normalize(j.status) === NORMALIZED_STATUS.IN_PROGRESS).length;
    const pendingCount = teamJobs.filter(j => normalize(j.status) === NORMALIZED_STATUS.PENDING || normalize(j.status) === NORMALIZED_STATUS.SCHEDULED).length;

    // Alert: High workload
    if (inProgressCount > 3) {
      alerts.push({
        title: 'High Workload Alert',
        subtitle: `Team has ${inProgressCount} active jobs in progress`,
        action: 'Review',
        urgent: true
      });
    }

    // Alert: Pending assignments
    if (pendingCount > 5) {
      alerts.push({
        title: 'Pending Jobs',
        subtitle: `${pendingCount} jobs waiting for assignment`,
        action: 'Assign',
        urgent: true
      });
    }

    // Alert: Team availability
    const activeTeam = team;
    const isTeamBusyFromLiveJobs = inProgressCount > 0;
    if (activeTeam && isTeamBusyFromLiveJobs) {
      alerts.push({
        title: 'Team Status',
        subtitle: `${requestedTeamName} is currently Busy`,
        action: 'Review',
        urgent: false
      });
    }

    // Alert: Completed jobs needing review
    const completedCount = teamJobs.filter(j => normalize(j.status) === NORMALIZED_STATUS.COMPLETED).length;
    if (completedCount > 0) {
      alerts.push({
        title: 'Jobs Completed',
        subtitle: `${completedCount} job(s) completed and need review`,
        action: 'Review',
        urgent: false
      });
    }

    // Default alert if no alerts generated
    if (alerts.length === 0) {
      alerts.push({
        title: 'No Urgent Alerts',
        subtitle: 'All systems operating normally',
        action: 'Review',
        urgent: false
      });
    }

    res.json({ success: true, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Capitalizes the first character in a status string.
 * @param {string} str
 * @returns {string}
 */
const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/\s+/g, ' ');
};

