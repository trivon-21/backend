const TEAM_ALIASES = {
  a: ['team a', 'teama', 'service team a', 'service-team-a', 'service team-a'],
  b: ['team b', 'teamb', 'service team b', 'service-team-b', 'service team-b'],
};

/**
 * Normalizes any team-related value for case-insensitive matching.
 * @param {unknown} value
 * @returns {string}
 */
const normalize = (value) => String(value || '').toLowerCase().trim();

/**
 * Resolves a canonical team key from a free-form team name.
 * @param {string} teamName
 * @returns {'a' | 'b' | null}
 */
const resolveTeamKey = (teamName) => {
  const normalized = normalize(teamName);
  if (TEAM_ALIASES.a.some((alias) => normalized.includes(alias))) return 'a';
  if (TEAM_ALIASES.b.some((alias) => normalized.includes(alias))) return 'b';
  return null;
};

/**
 * Extracts the best available assignment label from a job payload.
 * @param {Record<string, any>} job
 * @returns {string}
 */
const getAssignmentLabel = (job = {}) => {
  const candidates = [
    job.assignedTeamName,
    job.assignedTeam,
    job.teamName,
    job.serviceTeam,
    job.team,
    job.assignedToTeam,
    job.assignedTo,
  ];

  const label = candidates.find((value) => Boolean(value));
  if (!label) {
    return '';
  }

  if (typeof label === 'object') {
    return String(label.teamName || label.name || label._id || '');
  }

  return String(label);
};

/**
 * Compares a job/team label against the requested team name.
 * @param {string} value
 * @param {string} teamName
 * @returns {boolean}
 */
const matchesTeamName = (value, teamName) => {
  const normalizedValue = normalize(value);
  if (!normalizedValue) return false;

  const teamKey = resolveTeamKey(teamName);
  if (teamKey) {
    return TEAM_ALIASES[teamKey].some((alias) => normalizedValue.includes(alias));
  }

  const normalizedTeamName = normalize(teamName);
  return !normalizedTeamName || normalizedValue.includes(normalizedTeamName);
};

/**
 * Returns requested team name from query, or a safe fallback when absent.
 * @param {import('express').Request} req
 * @param {string} fallback
 * @returns {string}
 */
const getRequestedTeamName = (req, fallback = 'Service Team B') => String(req?.query?.teamName || fallback).trim() || fallback;

/**
 * Validates whether a job belongs to the requested team.
 * @param {Record<string, any>} job
 * @param {string} teamName
 * @returns {boolean}
 */
const matchesJobTeam = (job, teamName) => matchesTeamName(getAssignmentLabel(job), teamName);

/**
 * Validates whether a job belongs to Service Team B.
 * @param {Record<string, any>} job
 * @returns {boolean}
 */
const isTeamBJob = (job) => matchesTeamName(getAssignmentLabel(job), 'Service Team B');

exports.normalizeTeamName = normalize;
exports.getRequestedTeamName = getRequestedTeamName;
exports.getAssignmentLabel = getAssignmentLabel;
exports.matchesTeamName = matchesTeamName;
exports.matchesJobTeam = matchesJobTeam;
exports.isTeamBJob = isTeamBJob;