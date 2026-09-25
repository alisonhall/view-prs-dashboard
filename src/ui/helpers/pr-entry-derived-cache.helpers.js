// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsEntryDerivedCacheHelpers fallback.
export const { createEntryDerivedCache } = (() => {
  /**
   * Phase 5 (see REACT_MIGRATION_PLAN.md, "Performance Validation"): the
   * shared render pipeline re-derives several fairly expensive per-entry
   * values (filter-match results, label/assignee/approver extraction for
   * the filter dropdowns) from *every* stored PR entry on *every* render,
   * regardless of how many entries actually changed - measured as the
   * dominant, delta-size-independent cost behind the render pipeline.
   *
   * `mergeDataDeltaPayload` (pr-data-polling.helpers.js) merges polling
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
  const createEntryDerivedCache = () => {
    const cache = new WeakMap();

    const getOrCompute = (entry, cacheKey, compute) => {
      let entryCache = cache.get(entry);
      if (!entryCache) {
        entryCache = new Map();
        cache.set(entry, entryCache);
      }
      if (!entryCache.has(cacheKey)) {
        entryCache.set(cacheKey, compute());
      }
      return entryCache.get(cacheKey);
    };

    return {
      getOrCompute,
    };
  };

  return {
    createEntryDerivedCache,
  };
})();
