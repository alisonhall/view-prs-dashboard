(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsActivityBadgesHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
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

    // Pure badge-array construction for the Activity tab's two badge lists
    // (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md) - extracted out
    // of index.page.js's renderRequestActivity/renderSchedulerStatus the
    // same way getBackfillStatusViewModel already separates backfill's own
    // badge computation from its DOM/bridge call, so this logic keeps real
    // unit coverage now that #request-activity-badges/#scheduler-badges are
    // React-owned (BackfillBadges, reused) with no vanilla DOM left to
    // assert against in the jsdom integration suite.
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

    const getSchedulerBadges = (schedulerRaw = {}) => {
      const scheduler = schedulerRaw || {};
      const badges = [
        { text: `Every ${scheduler.intervalMinutes || 15}m` },
        { text: `Quick check: every ${scheduler.quickCheckIntervalMinutes || 5}m` },
        { text: `Manual cooldown ${scheduler.manualCooldownMinutes || 15}m` },
      ];

      const pendingOpenCount = Number(scheduler.pendingOpenCount || 0);
      const pendingMergedClosedCount = Number(scheduler.pendingMergedClosedCount || 0);
      if (pendingOpenCount > 0 || pendingMergedClosedCount > 0) {
        badges.push({
          text: `Update queued: ${pendingOpenCount} open, ${pendingMergedClosedCount} merged/closed`,
          className: "scheduler-badge-running",
        });
      }

      const autoRunBadge = scheduler.isAutoRunInProgress
        ? {
            text: "Auto run: in progress",
            className: "scheduler-badge-running",
          }
        : scheduler.lastAutoError
          ? {
              text: /timed out/i.test(String(scheduler.lastAutoError))
                ? "Auto run: timed out"
                : "Auto run: error",
              className: "scheduler-badge-error",
            }
          : {
              text: "Auto run: idle",
              className: "scheduler-badge-idle",
            };

      badges.push(autoRunBadge);
      return badges;
    };

    return {
      getRequestActivityBadges,
      getSchedulerBadges,
    };
  };

  return {
    createPrActivityBadgesHelpers,
  };
});
