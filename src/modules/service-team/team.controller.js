const mongoose = require('mongoose');
const Installation = require('../shared/installation/Installation');
const ServiceRequest = require('../shared/serviceRequest/ServiceRequest');
const TechTeam = require('../shared/tech-teams/TechTeam');
const { DEFAULT_TEAM_NAME } = require('../../config/app.config');
const { isTeamBJob } = require('../../utils/team.utils');
const { calculateAvailableSlots } = require('../../utils/availability.utils');
const {
  EXECUTION_STATUS,
  TEAM_STATUS,
} = require('../../constants/enums');

const TEAM_B_ALIASES = ['team b', 'service team b', 'service-team-b', 'service team-b', 'teamb'];

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
 * @returns {{id: string, name: string, role: string, phone: any, email: any}}
 */
const toMember = (doc = {}) => ({
  id: String(doc._id || ''),
  name: String(doc.name || doc.memberName || doc.fullName || '').trim(),
  role: String(doc.role || doc.designation || 'Member').trim(),
  phone: doc.phone || doc.mobile || null,
  email: doc.email || null
});

/**
 * Finds the Service Team B entity from flexible schema fields.
 * @returns {Promise<Record<string, any> | null>}
 */
const getTeamB = async () => {
  // Match by common aliases
  return TechTeam.findOne({
    $or: [
      { teamName: { $regex: '^service\\s*team\\s*b$', $options: 'i' } },
      { teamName: { $regex: '^team\\s*b$', $options: 'i' } },
      { name: { $regex: '^service\\s*team\\s*b$', $options: 'i' } },
      { code: { $regex: '^b$', $options: 'i' } },
      { teamCode: { $regex: '^b$', $options: 'i' } }
    ]
  }).lean();
};

/**
 * Loads team members by ID/name links from candidate collections.
 * @param {{teamId: string | null, teamName: string}} params
 * @returns {Promise<Record<string, any>[]>}
 */
const fetchMembersByTeam = async ({ teamId, teamName }) => {
  const db = mongoose.connection.db;
  if (!db) return [];

  const collectionsToTry = ['TechTeamMembers', 'techteammembers'];
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
        orFilters.push({ 'team.name': { $regex: `^${teamName}$`, $options: 'i' } });
      }

      // alias fallback
      for (const alias of TEAM_B_ALIASES) {
        orFilters.push({ teamName: { $regex: alias, $options: 'i' } });
        orFilters.push({ team: { $regex: alias, $options: 'i' } });
        orFilters.push({ 'team.name': { $regex: alias, $options: 'i' } });
      }

      const docs = await collection.find({ $or: orFilters }).toArray();
      all = all.concat(docs);
    } catch {
      // ignore and try next collection name
    }
  }

  // de-duplicate by _id
  const seen = new Set();
  return all.filter((m) => {
    const key = String(m._id || `${m.name || ''}-${m.phone || ''}-${m.email || ''}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

exports.getTeamDetails = async (req, res) => {
  try {
    const teamB = await getTeamB();
    const teamId = teamB?._id ? String(teamB._id) : null;
    const teamName = teamB?.teamName || teamB?.name || DEFAULT_TEAM_NAME;

    const [installs, requests, rawMembers] = await Promise.all([
      Installation.find({}).lean(),
      ServiceRequest.find({}).lean(),
      fetchMembersByTeam({ teamId, teamName })
    ]);

    const teamBJobs = [...installs, ...requests].filter(isTeamBJob);
    const inProgressJobsCount = teamBJobs.filter((j) => normalize(j.status) === normalize(EXECUTION_STATUS.IN_PROGRESS)).length;
    const freeSlots = calculateAvailableSlots(teamBJobs);

    const formattedMembers = rawMembers.map(toMember).filter((m) => m.name);

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
          teamName,
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