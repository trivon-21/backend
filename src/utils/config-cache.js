const SystemConfig = require('../models/SystemConfig');

// Cache configuration
let cachedConfig = null;
let cacheExpiration = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get system configuration with caching
 * @returns {Promise<SystemConfig>}
 */
async function getSystemConfig() {
  const now = Date.now();

  // Return from cache if valid
  if (cachedConfig && cacheExpiration > now) {
    return cachedConfig;
  }

  try {
    let config = await SystemConfig.findOne().populate('updatedBy', 'fullName email');

    if (!config) {
      // Create default config if it doesn't exist
      config = await SystemConfig.create({});
      config = await config.populate('updatedBy', 'fullName email');
    }

    // Update cache
    cachedConfig = config;
    cacheExpiration = now + CACHE_TTL;

    return config;
  } catch (error) {
    console.error('Error fetching system config:', error);
    // Return cached config even if expired on error
    if (cachedConfig) {
      return cachedConfig;
    }
    throw error;
  }
}

/**
 * Get business rules only
 * @returns {Promise<Object>}
 */
async function getBusinessRules() {
  const config = await getSystemConfig();
  return config.businessRules;
}

/**
 * Get feature flags only
 * @returns {Promise<Object>}
 */
async function getFeatureFlags() {
  const config = await getSystemConfig();
  return config.featureFlags;
}

/**
 * Get maintenance mode settings
 * @returns {Promise<Object>}
 */
async function getMaintenanceMode() {
  const config = await getSystemConfig();
  return config.maintenanceMode;
}

/**
 * Get system info
 * @returns {Promise<Object>}
 */
async function getSystemInfo() {
  const config = await getSystemConfig();
  return config.systemInfo;
}

/**
 * Force refresh cache
 * @returns {Promise<void>}
 */
async function refreshConfig() {
  cachedConfig = null;
  cacheExpiration = 0;
  await getSystemConfig();
}

/**
 * Clear cache (for testing or manual refresh)
 * @returns {void}
 */
function clearCache() {
  cachedConfig = null;
  cacheExpiration = 0;
}

module.exports = {
  getSystemConfig,
  getBusinessRules,
  getFeatureFlags,
  getMaintenanceMode,
  getSystemInfo,
  refreshConfig,
  clearCache,
};
