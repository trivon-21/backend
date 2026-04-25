const Installation = require('../shared/installation/Installation');
const ServiceRequest = require('../shared/serviceRequest/ServiceRequest');
const TechTeam = require('../shared/tech-teams/TechTeam');
const { DEFAULT_TEAM_NAME } = require('../../config/app.config');
const {
  getRequestedTeamName,
  matchesJobTeam,
  matchesTeamName,
} = require('../../utils/team.utils');


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

/**
 * GET: Dashboard summary - counts of active jobs, service requests, and installations
 */
exports.getDashboardSummary = async (req, res) => {
  try {
    const requestedTeamName = getRequestedTeamName(req, DEFAULT_TEAM_NAME);
    const [installs, requests] = await Promise.all([
      Installation.find({}).lean(),
      ServiceRequest.find({}).lean()
    ]);

    const assignedStageStatuses = new Set([
      'assigned',
      'scheduled',
      'pending',
      'finance approved',
      'sent to im'
    ]);

    const teamInstallations = installs.filter((job) => matchesJobTeam(job, requestedTeamName));
    const teamServiceRequests = requests.filter((job) => matchesJobTeam(job, requestedTeamName));

    const inProgressInstallations = teamInstallations.filter((item) => normalize(item.status) === 'in progress').length;
    const inProgressServiceRequests = teamServiceRequests.filter((item) => normalize(item.status) === 'in progress').length;

    const assignedInstallations = teamInstallations.filter((item) => assignedStageStatuses.has(normalize(item.status))).length;
    const assignedServiceRequests = teamServiceRequests.filter((item) => assignedStageStatuses.has(normalize(item.status))).length;

    const summary = {
      activeJobs: inProgressInstallations + inProgressServiceRequests,
      serviceRequests: assignedServiceRequests,
      installations: assignedInstallations,
      inProgressServiceRequests,
      inProgressInstallations
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
    const fetchLimit = Math.ceil(limit * 1.5);

    const [installs, requests] = await Promise.all([
      Installation.find({}).sort({ updatedAt: -1, createdAt: -1 }).limit(fetchLimit).lean(),
      ServiceRequest.find({}).sort({ updatedAt: -1, createdAt: -1 }).limit(fetchLimit).lean()
    ]);

    const allJobs = [...installs, ...requests].filter((job) => matchesJobTeam(job, requestedTeamName));

    const activityItems = allJobs.map((job) => {
      const timestamp = job.updatedAt || job.createdAt || new Date();
      const status = normalize(job.status);
      
      let type = 'service';
      let title = `Service Request Updated`;

      if (job.type === 'Installation' || job.units !== undefined) {
        type = 'installation';
        title = `Installation ${capitalize(status)}`;
      } else if (status === 'in progress') {
        type = 'service';
        title = `Service Job In Progress`;
      } else if (status === 'completed') {
        type = 'service';
        title = `Service Completed`;
      } else {
        title = `${job.customerName || 'Job'} - ${capitalize(status)}`;
      }

      return {
        type,
        title,
        timestamp
      };
    });

    const sorted = activityItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limited = sorted.slice(0, limit);

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
    const [installs, requests, teams] = await Promise.all([
      Installation.find({}).lean(),
      ServiceRequest.find({}).lean(),
      TechTeam.find({}).lean()
    ]);

    const teamJobs = [...installs, ...requests].filter((job) => matchesJobTeam(job, requestedTeamName));
    const alerts = [];

    const inProgressCount = teamJobs.filter(j => normalize(j.status) === 'in progress').length;
    const pendingCount = teamJobs.filter(j => normalize(j.status) === 'pending' || normalize(j.status) === 'scheduled').length;

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
    const activeTeam = teams.find((team) => matchesTeamName(team.teamName || team.name || team.team, requestedTeamName));
    if (activeTeam && normalize(activeTeam.status) === 'busy') {
      alerts.push({
        title: 'Team Status',
        subtitle: `${requestedTeamName} is currently marked as Busy`,
        action: 'Review',
        urgent: false
      });
    }

    // Alert: Completed jobs needing review
    const completedCount = teamJobs.filter(j => normalize(j.status) === 'completed').length;
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