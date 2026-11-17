'use strict';

const { createTtlCache } = require('../../utils/ttl-cache');

// Manager dashboard/analytics figures may lag reality by at most this long.
// Manager-initiated writes call invalidateManagerCache() so an approver never
// waits out the window to see their own decision take effect.
const MANAGER_CACHE_TTL_MS = 30 * 1000;

const MANAGER_CACHE_PREFIX = 'manager:';

const managerCache = createTtlCache({ ttlMs: MANAGER_CACHE_TTL_MS });

function invalidateManagerCache() {
  managerCache.invalidate(MANAGER_CACHE_PREFIX);
}

module.exports = {
  managerCache,
  invalidateManagerCache,
  MANAGER_CACHE_TTL_MS,
  MANAGER_CACHE_PREFIX,
};
