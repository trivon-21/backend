const TEAM_KEYS = {
  A: 'A',
  B: 'B',
};

const TEAM_NAME_PREFIX = 'Service Team';

const ROLE_KEYS = {
  MAIN_TECHNICIAN: 'main-technician',
  TECHNICIAN: 'technician',
  SERVICE_TEAM: 'service-team',
};

const ROUTES = {
  LOGIN: '/login',
  MAIN_TECHNICIAN_DASHBOARD: '/main-technician-dashboard',
  SERVICE_TEAM_DASHBOARD: '/service-team/dashboard',
};

const EMAIL_HINTS = {
  TEAM_A: 'servicea',
  TEAM_B: 'serviceb',
  MAIN_TECH: 'maintech',
  SERVICE: 'service',
};

const MESSAGES = {
  REQUIRED_CREDENTIALS: 'Email and password are required.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  LOGIN_FAILED: 'Login failed.',
};

module.exports = {
  TEAM_KEYS,
  TEAM_NAME_PREFIX,
  ROLE_KEYS,
  ROUTES,
  EMAIL_HINTS,
  MESSAGES,
};
