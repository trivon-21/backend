'use strict';

const { createTtlCache } = require('../../utils/ttl-cache');

// Inventory-manager dashboard/list figures may lag reality by at most this long.
// Inventory mutations call invalidateInventoryCache() to keep data fresh immediately after writes.
const INVENTORY_CACHE_TTL_MS = 30 * 1000;

const INVENTORY_CACHE_PREFIX = 'inventory:';

// Every key lives under INVENTORY_CACHE_PREFIX so the broad invalidation below
// still clears all of them; the entity segment lets a write that cannot affect
// another feature's data leave that feature's entries warm.
const INVENTORY_CACHE_PREFIXES = {
  PROCUREMENT: 'inventory:procurement:',
  DISPATCH: 'inventory:dispatch:',
  CATALOG: 'inventory:catalog:',
  MATERIAL_REQUEST: 'inventory:material-request:',
  ASSET_LOAN: 'inventory:asset-loan:',
  QUARANTINE: 'inventory:quarantine:',
  RETURNS: 'inventory:returns:',
  DASHBOARD: 'inventory:dashboard',
  ACTIVITY: 'inventory:activity',
};

const inventoryCache = createTtlCache({ ttlMs: INVENTORY_CACHE_TTL_MS });

/** Clears every inventory-manager entry. Use whenever stock quantities move. */
function invalidateInventoryCache() {
  inventoryCache.invalidate(INVENTORY_CACHE_PREFIX);
}

/** Clears only the named scopes — for writes that cannot change stock figures. */
function invalidateInventoryScopes(...prefixes) {
  for (const prefix of prefixes) inventoryCache.invalidate(prefix);
}

module.exports = {
  inventoryCache,
  invalidateInventoryCache,
  invalidateInventoryScopes,
  INVENTORY_CACHE_TTL_MS,
  INVENTORY_CACHE_PREFIX,
  INVENTORY_CACHE_PREFIXES,
};
