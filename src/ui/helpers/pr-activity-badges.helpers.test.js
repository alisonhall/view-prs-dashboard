const { createPrActivityBadgesHelpers } = require("../helpers/pr-activity-badges.helpers.js");

describe("pr activity badges helpers", () => {
  const withElapsedSuffix = (label, elapsedMs) =>
    Number.isFinite(elapsedMs) && elapsedMs >= 0 ? `${label} (${elapsedMs}ms)` : label;
  const getRequestActivitySeverityClass = (elapsedMs) => {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "";
    if (elapsedMs >= 360000) return "scheduler-badge-critical";
    if (elapsedMs >= 120000) return "scheduler-badge-warning";
    return "";
  };

  const { getRequestActivityBadges, getSchedulerBadges } = createPrActivityBadgesHelpers({
    withElapsedSuffix,
    getRequestActivitySeverityClass,
  });

  describe("getRequestActivityBadges", () => {
    test("given no active entries and no auto run, when computing badges, then it returns a single idle badge", () => {
      expect(getRequestActivityBadges({})).toEqual([
        { text: "No request in progress", className: "scheduler-badge-idle" },
      ]);
    });

    test("given an active entry, when computing badges, then it returns a running-count badge plus the entry badge with elapsed suffix", () => {
      const badges = getRequestActivityBadges({
        activeEntries: [{ label: "Run script x1", elapsedMs: 5000 }],
      });

      expect(badges).toEqual([
        { text: "1 request in progress", className: "scheduler-badge-running" },
        { text: "Run script x1 (5000ms)", className: "scheduler-badge-running " },
      ]);
    });

    test("given multiple active entries and an in-progress auto run, when computing badges, then the total count includes the auto run and both are listed", () => {
      const badges = getRequestActivityBadges({
        activeEntries: [
          { label: "Ack/Clear x1", elapsedMs: 1000 },
          { label: "Data refresh x1", elapsedMs: 2000 },
        ],
        isAutoRunInProgress: true,
        autoRunElapsedMs: 400000,
      });

      expect(badges).toEqual([
        { text: "3 requests in progress", className: "scheduler-badge-running" },
        { text: "Auto run (400000ms)", className: "scheduler-badge-running scheduler-badge-critical" },
        { text: "Ack/Clear x1 (1000ms)", className: "scheduler-badge-running " },
        { text: "Data refresh x1 (2000ms)", className: "scheduler-badge-running " },
      ]);
    });

    test("given a long-running entry, when computing badges, then its severity class reflects the elapsed threshold", () => {
      const badges = getRequestActivityBadges({
        activeEntries: [{ label: "Backfill request x1", elapsedMs: 150000 }],
      });

      expect(badges[1]).toEqual({
        text: "Backfill request x1 (150000ms)",
        className: "scheduler-badge-running scheduler-badge-warning",
      });
    });
  });

  describe("getSchedulerBadges", () => {
    test("given a minimal scheduler payload, when computing badges, then interval/quick-check/cooldown badges use defaults and auto run is idle", () => {
      expect(getSchedulerBadges({})).toEqual([
        { text: "Every 15m" },
        { text: "Quick check: every 5m" },
        { text: "Manual cooldown 15m" },
        { text: "Auto run: idle", className: "scheduler-badge-idle" },
      ]);
    });

    test("given a scheduler with custom intervals and pending work, when computing badges, then a queued-update badge is included", () => {
      const badges = getSchedulerBadges({
        intervalMinutes: 30,
        quickCheckIntervalMinutes: 10,
        manualCooldownMinutes: 20,
        pendingOpenCount: 2,
        pendingMergedClosedCount: 1,
      });

      expect(badges).toEqual([
        { text: "Every 30m" },
        { text: "Quick check: every 10m" },
        { text: "Manual cooldown 20m" },
        { text: "Update queued: 2 open, 1 merged/closed", className: "scheduler-badge-running" },
        { text: "Auto run: idle", className: "scheduler-badge-idle" },
      ]);
    });

    test("given an auto run in progress, when computing badges, then the auto run badge reflects that", () => {
      const badges = getSchedulerBadges({ isAutoRunInProgress: true });
      expect(badges[badges.length - 1]).toEqual({
        text: "Auto run: in progress",
        className: "scheduler-badge-running",
      });
    });

    test("given a timed-out auto error, when computing badges, then the auto run badge says timed out", () => {
      const badges = getSchedulerBadges({
        lastAutoError: "owner/repo: Auto refresh timed out after 900s",
      });
      expect(badges[badges.length - 1]).toEqual({
        text: "Auto run: timed out",
        className: "scheduler-badge-error",
      });
    });

    test("given a non-timeout auto error, when computing badges, then the auto run badge says error", () => {
      const badges = getSchedulerBadges({ lastAutoError: "boom" });
      expect(badges[badges.length - 1]).toEqual({
        text: "Auto run: error",
        className: "scheduler-badge-error",
      });
    });
  });
});
