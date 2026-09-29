// Bulk PR-action progress UI (see REACT_MIGRATION_PLAN.md / the saved plan
// for the full context): runs `worker(item)` over `items` with at most
// `limit` in flight at once. No existing precedent for this in the
// codebase (confirmed via research before writing this) - kept
// deliberately small rather than pulling in a dependency for one function.
//
// A single rejected/thrown worker call does NOT stop the rest - each
// item's outcome is captured individually (via `worker` itself resolving
// to a result object, or throwing, both handled the same way below), so a
// bulk operation's partial failure doesn't hide the outcome of every other
// item. Callers that need per-item success/failure detail should have
// `worker` catch its own errors and return a `{ ok: false, error }`-shaped
// result rather than throwing, so `runWithConcurrencyLimit` doesn't need
// to know anything about what a "successful" result looks like for a
// given caller.
export const { createPrConcurrencyHelpers } = (() => {
  const createPrConcurrencyHelpers = () => {
    const runWithConcurrencyLimit = async (items, limit, worker) => {
      const list = Array.isArray(items) ? items : [];
      const workerSafe = typeof worker === "function" ? worker : async () => undefined;
      const concurrency = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : list.length || 1;

      const results = new Array(list.length);
      let nextIndex = 0;

      const runNext = async () => {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= list.length) {
          return;
        }
        try {
          results[currentIndex] = await workerSafe(list[currentIndex], currentIndex);
        } catch (error) {
          results[currentIndex] = { ok: false, error };
        }
        await runNext();
      };

      const runnerCount = Math.min(concurrency, list.length);
      await Promise.all(Array.from({ length: runnerCount }, () => runNext()));

      return results;
    };

    return {
      runWithConcurrencyLimit,
    };
  };

  return {
    createPrConcurrencyHelpers,
  };
})();
