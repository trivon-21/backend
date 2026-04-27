const Info = require('./auth.model');
const {
  TEAM_KEYS,
  TEAM_NAME_PREFIX,
  ROLE_KEYS,
  ROUTES,
  EMAIL_HINTS,
  MESSAGES,
} = require('./auth.constants');

const normalizeTeamKey = (value) => {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim().toUpperCase();
  if (raw === TEAM_KEYS.A || raw === TEAM_KEYS.B) return raw;
  return null;
};

const inferTeamKeyFromEmail = (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (normalizedEmail.includes(EMAIL_HINTS.TEAM_A)) return TEAM_KEYS.A;
  if (normalizedEmail.includes(EMAIL_HINTS.TEAM_B)) return TEAM_KEYS.B;
  return null;
};

const buildTeamSession = (doc) => {
  const normalizedEmail = String(doc.email || '').trim().toLowerCase();
  const teamKey =
    normalizeTeamKey(doc.teamKey) ||
    (String(doc.teamName || '').toUpperCase().includes(TEAM_KEYS.A) ? TEAM_KEYS.A : null) ||
    (String(doc.teamName || '').toUpperCase().includes(TEAM_KEYS.B) ? TEAM_KEYS.B : null) ||
    inferTeamKeyFromEmail(normalizedEmail);

  const teamName =
    (doc.teamName ? String(doc.teamName).trim() : null) ||
    (teamKey ? `${TEAM_NAME_PREFIX} ${teamKey}` : null);

  if (!teamKey || !teamName) return null;

  return {
    teamKey,
    teamName,
    email: normalizedEmail,
  };
};

const buildRoute = (doc) => {
  if (doc.route) {
    return String(doc.route).trim();
  }

  const role = String(doc.role || '').trim().toLowerCase();
  const normalizedEmail = String(doc.email || '').trim().toLowerCase();
  if (role === ROLE_KEYS.MAIN_TECHNICIAN || role === ROLE_KEYS.TECHNICIAN) {
    return ROUTES.MAIN_TECHNICIAN_DASHBOARD;
  }

  if (role === ROLE_KEYS.SERVICE_TEAM) {
    return ROUTES.SERVICE_TEAM_DASHBOARD;
  }

  if (buildTeamSession(doc)) {
    return ROUTES.SERVICE_TEAM_DASHBOARD;
  }

  if (normalizedEmail.includes(EMAIL_HINTS.MAIN_TECH)) {
    return ROUTES.MAIN_TECHNICIAN_DASHBOARD;
  }

  if (normalizedEmail.includes(EMAIL_HINTS.SERVICE)) {
    return ROUTES.SERVICE_TEAM_DASHBOARD;
  }

  return ROUTES.LOGIN;
};

const login = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '').trim();

    if (!email || !password) {
      return res.status(400).json({ success: false, error: MESSAGES.REQUIRED_CREDENTIALS });
    }

    const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const numericPassword = Number(password);
    const passwordMatches = [password];
    if (!Number.isNaN(numericPassword)) {
      passwordMatches.push(numericPassword);
    }

    const infoDoc = await Info.findOne({
      email: { $regex: `^${escapedEmail}$`, $options: 'i' },
      password: { $in: passwordMatches },
    }).lean();

    if (!infoDoc) {
      return res.status(401).json({ success: false, error: MESSAGES.INVALID_CREDENTIALS });
    }

    const teamSession = buildTeamSession(infoDoc);
    const route = buildRoute(infoDoc);

    return res.status(200).json({
      success: true,
      data: {
        route,
        teamSession,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message || MESSAGES.LOGIN_FAILED });
  }
};

module.exports = {
  login,
};
