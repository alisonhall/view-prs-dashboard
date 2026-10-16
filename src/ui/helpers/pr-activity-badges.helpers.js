// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsActivityBadgesHelpers fallback.
export const { createPrActivityBadgesHelpers } = (() => {
  const createPrActivityBadgesHelpers = ({
    withElapsedSuffix,
    getRequestActivitySeverityClass,
  } = {}) => {
    const withElapsedSuffixSafe =
      typeof withElapsedSuffix === "function" ? withElapsedSuffix : (label) => label;
    const getRequestActivitySeverityClassSafe =
      typeof getRequestActivitySeverityClass === "function"
        ? getRequestActivitySeverityClass
        : () => "";

    // Pure badge-array construction for the Activity tab's request-activity
    // badge list (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md) -
    // extracted out of index.page.js's renderRequestActivity the same way
    // getBackfillStatusViewModel already separates backfill's own badge
    // computation from its DOM/bridge call, so this logic keeps real unit
    // coverage now that #request-activity-badges is React-owned
    // (BackfillBadges, reused) with no vanilla DOM left to assert against
    // in the jsdom integration suite. (This factory used to also export
    // getSchedulerBadges, for the Status tab's own #scheduler-badges - that
    // display was removed as redundant with the activity drawer's live
    // "Scheduled background jobs" section, see REACT_MIGRATION_PLAN.md.)
    const getRequestActivityBadges = ({
      activeEntries = [],
      isAutoRunInProgress = false,
      autoRunElapsedMs = null,
    } = {}) => {
      const totalActive = activeEntries.length + (isAutoRunInProgress ? 1 : 0);

      if (totalActive === 0) {
        return [{ text: "No request in progress", className: "scheduler-badge-idle" }];
      }

      const badges = [
        {
          text: `${totalActive} request${totalActive === 1 ? "" : "s"} in progress`,
          className: "scheduler-badge-running",
        },
      ];

      if (isAutoRunInProgress) {
        badges.push({
          text: withElapsedSuffixSafe("Auto run", autoRunElapsedMs),
          className: `scheduler-badge-running ${getRequestActivitySeverityClassSafe(autoRunElapsedMs)}`,
        });
      }

      activeEntries.forEach((entry) => {
        badges.push({
          text: withElapsedSuffixSafe(entry.label, entry.elapsedMs),
          className: `scheduler-badge-running ${getRequestActivitySeverityClassSafe(entry.elapsedMs)}`,
        });
      });

      return badges;
    };

    return {
      getRequestActivityBadges,
    };
  };

  return {
    createPrActivityBadgesHelpers,
  };
})();
