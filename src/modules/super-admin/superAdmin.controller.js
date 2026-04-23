// src/controllers/dashboard.controller.js
const InspectionReport = require('../inspection-team/inspection.model');
const Inspection = require('../shared/inspection/Inspection');
const Installation = require('../shared/installation/Installation');
const ServiceRequest = require('../shared/serviceRequest/ServiceRequest');
const TechTeam = require('../service-team/serviceTeam.model');
const NewRequest = require('../shared/serviceRequest/NewRequest');

// Team availability on dashboard should match team-management page behavior.
const IN_PROGRESS_STATUS = 'In Progress';


const getAssignedTeamKey = (item) => String(item?.assignedTeamId || item?.assignedTeam || '').trim();
const buildInspectionTeamResolver = (teams) => {
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

    return singleInspectionTeamId;
  };
};


exports.getDashboardSummary = async (req, res) => {
  try {
    // Fetch all metrics in parallel for performance
    const [
      pendingReviews,
      activeInspections,
      activeInstallations,
      activeServices,
      teams,
      serviceAssignments,
      installationAssignments,
      inspectionAssignments
    ] = await Promise.all([
      // Count inspection reports pending review
      InspectionReport.countDocuments({ status: 'Pending' }),
      
      // Count in-progress inspections
      Inspection.countDocuments({ status: 'In Progress' }),
      
      // Count in-progress installations
      Installation.countDocuments({ status: 'In Progress' }),
      
      // Count in-progress service requests
      ServiceRequest.countDocuments({ status: 'In Progress' }),
      
      // Get list of all teams
      TechTeam.find().select('_id teamType teamName').lean(),
      
      // Get service requests currently in progress for team availability.
      ServiceRequest.find({ status: IN_PROGRESS_STATUS })
        .select('assignedTeam assignedTeamId')
        .lean(),
      
      // Get installations currently in progress for team availability.
      Installation.find({ status: IN_PROGRESS_STATUS })
        .select('assignedTeam assignedTeamId')
        .lean(),
      
      // Get inspections currently in progress for team availability.
      Inspection.find({ status: IN_PROGRESS_STATUS })
        .select('assignedTeam assignedTeamId assignedTeamName teamName inspectionMeta.team')
        .lean()
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

    // Collect busy team IDs from all assignment types
    collectBusyTeamIds(serviceAssignments);
    collectBusyTeamIds(installationAssignments);
    collectInspectionBusyTeamIds(inspectionAssignments);

    // Calculate available teams by subtracting assigned from total
    const teamsAvailable = Math.max(0, teams.length - busyTeamIdSet.size);

    // Return aggregated dashboard metrics
    res.json({
      success: true,
      data: {
        pendingReviews,
        activeJobs: activeInspections + activeInstallations + activeServices,
        serviceRequests: activeServices,
        teamAvailable: teamsAvailable
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


exports.getRecentActivity = async (req, res) => {
  try {
    // Parse limit from query with fallback to 5
    const limit = parseInt(req.query.limit) || 5;

    // Fetch recent activities from all three collections in parallel
    const [
      recentInspectionReports,
      recentInstallations,
      recentServiceRequests
    ] = await Promise.all([
      InspectionReport.find()
        .populate('customerId', 'name')
        .sort({ updatedAt: -1 })
        .limit(limit),
      Installation.find()
        .populate('customerId', 'name')
        .sort({ updatedAt: -1 })
        .limit(limit),
      ServiceRequest.find()
        .populate('customerId', 'name')
        .sort({ createdAt: -1 })
        .limit(limit)
    ]);

    const activities = [];

    // Add inspection report activities
    recentInspectionReports.forEach(item => {
      activities.push({
        type: 'inspection',
        id: item._id,
        title: `New Inspection Report - ${item.customerId?.name || 'Customer'}`,
        timestamp: item.updatedAt,
        icon: 'inspection'
      });
    });

    // Add installation activities
    recentInstallations.forEach(item => {
      activities.push({
        type: 'installation',
        id: item._id,
        title: `Installation Progress Update - ${item.customerId?.name || 'Customer'}`,
        timestamp: item.updatedAt,
        icon: 'installation'
      });
    });

    // Add service request activities
    recentServiceRequests.forEach(item => {
      activities.push({
        type: 'service',
        id: item._id,
        title: `Service Request Update - ${item.customerId?.name || 'Customer'}`,
        timestamp: item.createdAt,
        icon: 'service'
      });
    });

    // Sort combined activities by timestamp (newest first) and return requested limit
    const data = activities.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


exports.getUrgentAlerts = async (req, res) => {
  try {
    // Fetch newest material requests
    const newMaterialRequests = await NewRequest.find()
      .populate('customerId', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // Map material requests to alert format
    const alerts = newMaterialRequests.map((item) => ({
      type: 'material',
      id: item._id,
      title: 'New Material Request',
      subtitle: `Customer: ${item.customerId?.name || 'Unknown'}`,
      action: 'Review',
      urgent: true
    }));

    res.json({ success: true, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};