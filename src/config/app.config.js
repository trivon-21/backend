const DEFAULT_TEAM_NAME = process.env.DEFAULT_TEAM_NAME || 'Service Team B';

const getLocalApiBaseUrl = () => {
  return process.env.LOCAL_API_BASE_URL || `http://localhost:${process.env.PORT || 3000}/api`;
};

module.exports = {
  DEFAULT_TEAM_NAME,
  getLocalApiBaseUrl,
};
