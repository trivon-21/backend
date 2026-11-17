const mongoose = require('mongoose');
const Installation = require('../shared/installation/installation.model');
const ServiceRequest = require('../shared/repair/repair.model');
const Maintenance = require('../shared/maintenance/maintenance.model');
const TechTeam = require('../shared/tech-teams/techTeam.model');
const { DEFAULT_TEAM_NAME } = require('../../config/app.config');
const { isTeamBJob, getRequestedTeamName, matchesJobTeam, resolveTeamKey, matchesTeamName } = require('../../utils/team.utils');
const { calculateAvailableTimeSlots, calculateAvailableSlots } = require('../../utils/availability.utils');
const {
  EXECUTION_STATUS,
  TEAM_STATUS,
} = require('../../constants/enums');

/**
 * Normalizes strings for matching and filtering.
 * @param {unknown} v
 * @returns {string}
 */
const normalize = (v) => String(v || '').toLowerCase().trim();

/**
 * Converts a value to ObjectId when possible.
 * @param {unknown} v
 * @returns {mongoose.Types.ObjectId | null}
 */
const toObjectId = (v) => {
  try {
    if (!v) return null;
    if (v instanceof mongoose.Types.ObjectId) return v;
    if (mongoose.Types.ObjectId.isValid(String(v))) return new mongoose.Types.ObjectId(String(v));
    return null;
  } catch {
    return null;
  }
};

/**
 * Normalizes raw member documents into API-safe shape.
 * @param {Record<string, any>} doc
 * @returns {{id: string, fullName: string, role: string, phone: any, email: any}}
 */
const toMember = (doc = {}) => {
  const name = String(doc.fullName || doc.name || doc.memberName || '').trim();
  return {
    id: String(doc._id || ''),
    fullName: name,
    name: name,
    role: String(doc.role || doc.designation || 'Member').trim(),
    phone: doc.phone || doc.mobile || null,
    email: doc.email || null
  };
};

/**
 * Loads team members by ID/fullName links from candidate collections.
 * @param {{teamId: string | null, teamName: string}} params
 * @returns {Promise<Record<string, any>[]>}
 */
const fetchMembersByTeam = async ({ teamId, teamName }) => {
  const db = mongoose.connection.db;
  if (!db) return [];

  const collectionsToTry = ['tech_team_members', 'TechTeamMembers', 'techteammembers'];
  let all = [];

  for (const c of collectionsToTry) {
    try {
      const collection = db.collection(c);

      const orFilters = [];
      const teamObjectId = toObjectId(teamId);

      // teamId links
      if (teamObjectId) orFilters.push({ teamId: teamObjectId });
      if (teamId) orFilters.push({ teamId: String(teamId) });

      // common embedded/object links
      if (teamObjectId) orFilters.push({ 'team._id': teamObjectId });
      if (teamId) orFilters.push({ 'team._id': String(teamId) });
      if (teamName) {
        orFilters.push({ teamName: { $regex: `^${teamName}$`, $options: 'i' } });
        orFilters.push({ team: { $regex: `^${teamName}$`, $options: 'i' } });
        orFilters.push({ 'team.fullName': { $regex: `^${teamName}$`, $options: 'i' } });
      }

      const docs = await collection.find({ $or: orFilters }).toArray();
      all = all.concat(docs);
    } catch {
      // ignore and try next collection
    }
  }

  // filter fallback by manual check if they somehow matched loosely
  let filtered = all;
  if (all.length > 0) {
    filtered = all.filter(m => {
       const mTeamName = m.teamName || m.team?.fullName || m.team || '';
       if (teamId && m.teamId && String(m.teamId) === String(teamId)) return true;
       if (teamObjectId && m.team?._id && String(m.team._id) === String(teamObjectId)) return true;
       return matchesTeamName(mTeamName, teamName);
    });
  }
  
  if (filtered.length === 0) filtered = all;

  // de-duplicate by _id
  const seen = new Set();
  return filtered.filter((m) => {
    const key = String(m._id || `${m.fullName || ''}-${m.phone || ''}-${m.email || ''}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

exports.getTeamDetails = async (req, res) => {
  try {
    const requestedTeamName = getRequestedTeamName(req, DEFAULT_TEAM_NAME);
    const { resolveTeam } = require('../../utils/team.utils');
    const techTeam = await resolveTeam(requestedTeamName);
    
    const teamId = techTeam?._id ? String(techTeam._id) : null;
    const resolvedTeamName = techTeam?.teamName || techTeam?.fullName || requestedTeamName;
    let query = { $or: [] };
    if (teamId) {
      const teamIdStr = String(techTeam._id);
      const teamIdObj = toObjectId(teamIdStr);
      const teamNamePattern = new RegExp(`^${resolvedTeamName}$`, 'i');
      query.$or = [
        { assignedTeamId: teamIdObj },
        { assignedTeamId: teamIdStr },
        { assignedTeamName: { $regex: teamNamePattern } },
        { assignedTeam: { $regex: teamNamePattern } },
        { teamName: { $regex: teamNamePattern } },
        { assignedTo: { $regex: teamNamePattern } }
      ];
      if (techTeam?.fullName) {
        const fullNamePattern = new RegExp(`^${techTeam.fullName.trim()}$`, 'i');
        query.$or.push(
          { assignedTeamName: { $regex: fullNamePattern } },
          { assignedTeam: { $regex: fullNamePattern } },
          { teamName: { $regex: fullNamePattern } },
          { assignedTo: { $regex: fullNamePattern } }
        );
      }
    }

    const [installs, requests, maintenances, rawMembers] = await Promise.all([
      teamId ? Installation.find(query).lean() : Promise.resolve([]),
      teamId ? ServiceRequest.find(query).lean() : Promise.resolve([]),
      teamId ? Maintenance.find(query).lean() : Promise.resolve([]),
      fetchMembersByTeam({ teamId, teamName: resolvedTeamName })
    ]);

    const teamJobs = [...installs, ...requests, ...maintenances];
    const inProgressJobsCount = teamJobs.filter((j) => normalize(j.status) === normalize(EXECUTION_STATUS.IN_PROGRESS)).length;
    const freeSlots = calculateAvailableTimeSlots(teamJobs);

    const formattedMembers = rawMembers.map(toMember).filter((m) => m.fullName);

    const teamLeader =
      formattedMembers.find((m) => {
        const r = normalize(m.role);
        return r === 'team leader' || r === 'team lead';
      }) || null;

    const teamMembers = formattedMembers.filter((m) => {
      const r = normalize(m.role);
      return r !== 'team leader' && r !== 'team lead';
    });

    res.json({
      success: true,
      data: {
        team: {
          id: teamId || null,
          teamName: resolvedTeamName,
          teamType: 'Service Team',
          status: inProgressJobsCount > 0 ? TEAM_STATUS.BUSY : TEAM_STATUS.AVAILABLE,
          activeJobsCount: inProgressJobsCount,
          availableSlots: freeSlots
        },
        teamLeader,     // null if not found in DB
        teamMembers     // [] if not found in DB
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve team member details',
      error: err.message
    });
  }
};

