/**
 * Per-entry cache for values derived from a PR entry (filter-match results,
 * label/assignee/approver extraction for the filter dropdowns), so only
 * entries that actually changed are re-derived on each render.
 *
 * `mergeDataDeltaPayload` (pr-data-polling.helpers.ts) merges polling
 * deltas via a shallow spread, so an entry for a PR that didn't change
 * keeps its exact object reference across renders. A WeakMap keyed by
 * that entry object is therefore a correct, low-risk cache: an entry
 * that changed (or was removed) is simply a different/absent key, so
 * there's no manual invalidation to get wrong, and unreachable entries
 * are freed automatically by the garbage collector rather than leaking.
 *
 * `cacheKey` distinguishes what's cached per entry - a derivation that's
 * a pure function of the entry alone (e.g. its labels) needs no
 * variation; one that also depends on something else that can change
 * independently of the entry (e.g. a filter-match result, which depends
 * on the *current* filter criteria too) should fold a fingerprint of
 * that other input into the key, so a criteria change naturally busts
 * every entry's cached result for that key without extra bookkeeping.
 */
interface LatestVariant {
  variant: unknown;
  value: unknown;
}

export interface EntryDerivedCache {
  getOrCompute: <T>(entry: object, cacheKey: string, compute: () => T) => T;
  getOrComputeLatest: <T>(entry: object, cacheKey: string, variant: unknown, compute: () => T) => T;
  getCachedKeyCount: (entry: object) => number;
}

const createEntryDerivedCache = (): EntryDerivedCache => {
  // Each key holds either a plain result (getOrCompute) or a
  // { variant, value } record (getOrComputeLatest); a key is only ever
  // used by one of the two.
  const cache = new WeakMap<object, Map<string, unknown>>();

  const getEntryCache = (entry: object): Map<string, unknown> => {
    let entryCache = cache.get(entry);
    if (!entryCache) {
      entryCache = new Map();
      cache.set(entry, entryCache);
    }
    return entryCache;
  };

  const getOrCompute = <T>(entry: object, cacheKey: string, compute: () => T): T => {
    const entryCache = getEntryCache(entry);
    if (!entryCache.has(cacheKey)) {
      entryCache.set(cacheKey, compute());
    }
    return entryCache.get(cacheKey) as T;
  };

  // Like getOrCompute, but keeps only the *latest* variant per
  // (entry, cacheKey) instead of one result per variant ever seen. Use
  // this - not getOrCompute with the variant folded into the key - when
  // the variant is something that churns without the entry changing
  // (e.g. the filter criteria while the user types): the WeakMap above
  // only frees an entry's Map when the *entry object* dies, and entries
  // keep the same reference across renders while their data is unchanged,
  // so a key-per-variant Map grows by one result per keystroke per
  // loaded PR, forever (found as a renderer out-of-memory crash, "Error
  // code: 5", after typing into the free-text filter fields). A variant
  // change here overwrites the previous result, so the cost is a
  // recompute when switching back to an earlier variant, never growth.
  const getOrComputeLatest = <T>(entry: object, cacheKey: string, variant: unknown, compute: () => T): T => {
    const entryCache = getEntryCache(entry);
    const cached = entryCache.get(cacheKey) as LatestVariant | undefined;
    if (cached && cached.variant === variant) {
      return cached.value as T;
    }
    const value = compute();
    entryCache.set(cacheKey, { variant, value });
    return value;
  };

  // Number of cached keys held for an entry - for tests/diagnostics, to
  // assert the cache stays bounded.
  const getCachedKeyCount = (entry: object): number => cache.get(entry)?.size || 0;

  return {
    getOrCompute,
    getOrComputeLatest,
    getCachedKeyCount,
  };
};

export { createEntryDerivedCache };
