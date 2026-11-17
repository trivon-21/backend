'use strict';

/**
 * Keyed TTL cache with single-flight loading.
 *
 * Generalises the module-level pattern in utils/config-cache.js to many keys and
 * adds request coalescing: two concurrent callers asking for the same key share
 * one loader invocation instead of racing to fill the same slot.
 *
 * Rejections are never cached — a failed load clears the in-flight slot so the
 * next caller retries against the database.
 */
function createTtlCache({ ttlMs }) {
  const entries = new Map(); // key -> { value, expiresAt }
  const inFlight = new Map(); // key -> { promise, generation }
  let generation = 0;
  let hits = 0;
  let misses = 0;

  async function get(key, loader) {
    const entry = entries.get(key);
    if (entry && entry.expiresAt > Date.now()) {
      hits += 1;
      return entry.value;
    }

    const pending = inFlight.get(key);
    if (pending) {
      hits += 1;
      return pending.promise;
    }

    misses += 1;
    const startedAt = generation;
    const promise = (async () => {
      const value = await loader();
      // A write that invalidated this key while the load was in flight bumps
      // `generation`; the value we are holding predates that write, so serve it
      // to the current callers but do not cache it.
      if (generation === startedAt) {
        entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      }
      return value;
    })();

    inFlight.set(key, { promise, generation: startedAt });
    try {
      return await promise;
    } catch (error) {
      entries.delete(key);
      throw error;
    } finally {
      if (inFlight.get(key)?.promise === promise) inFlight.delete(key);
    }
  }

  function invalidate(prefix) {
    generation += 1;
    for (const key of entries.keys()) {
      if (key.startsWith(prefix)) entries.delete(key);
    }
    // Callers arriving after this point must start a fresh load rather than
    // attaching to a load that began before the invalidating write.
    for (const key of inFlight.keys()) {
      if (key.startsWith(prefix)) inFlight.delete(key);
    }
  }

  function clear() {
    generation += 1;
    entries.clear();
    inFlight.clear();
    hits = 0;
    misses = 0;
  }

  function stats() {
    return { hits, misses, size: entries.size };
  }

  return { get, invalidate, clear, stats };
}

module.exports = { createTtlCache };
