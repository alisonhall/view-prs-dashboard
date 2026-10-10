const {
  createViewPrsDispatcherHelpers,
} = require("./view-prs-dispatcher-helpers");

const BASE_MS = Date.parse("2026-01-01T00:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();

const DEFAULT_INTERVALS = {
  quickCheck: 5 * 60 * 1000,
  autoRefresh: 15 * 60 * 1000,
  mergedDrain: 30 * 60 * 1000,
};

describe("View Prs Dispatcher Helpers", () => {
  let mockConsole;
  let viewPrsSchedulerState;
  let clockMs;
  let schedulerRepoConfig;
  let helpers;

  const makeHelpers = (overrides = {}) =>
    createViewPrsDispatcherHelpers({
      console: mockConsole,
      now: () => clockMs,
      parseTimestamp: (value) => {
        const ms = Date.parse(value);
        return Number.isFinite(ms) ? ms : null;
      },
      viewPrsSchedulerState,
      getViewPrsAutoRefreshRepos: () => ["owner/repoA"],
      getSchedulerRepoConfig: () => schedulerRepoConfig,
      defaultIntervalsByTaskType: DEFAULT_INTERVALS,
      ...overrides,
    });

  beforeEach(() => {
    mockConsole = { warn: jest.fn(), error: jest.fn() };
    viewPrsSchedulerState = {};
    clockMs = BASE_MS;
    schedulerRepoConfig = {};
    helpers = makeHelpers();
  });

  describe("Given getOrInitRegistry", () => {
    test("When called on a fresh state, Then it creates one entry per (repo, taskType), immediately due", () => {
      const entries = helpers.getOrInitRegistry();

      expect(Object.keys(entries).sort()).toEqual([
        "owner/repoA::autoRefresh",
        "owner/repoA::mergedDrain",
        "owner/repoA::quickCheck",
      ]);
      Object.values(entries).forEach((entry) => {
        expect(entry.nextDueAt).toBe(iso(BASE_MS));
        expect(entry.isRunning).toBe(false);
      });
    });

    test("When called for N repos, Then getSchedulerRepoConfig is read exactly once per call, not once per (repo, taskType) entry", () => {
      const getSchedulerRepoConfig = jest.fn(() => ({}));
      helpers = makeHelpers({
        getViewPrsAutoRefreshRepos: () => ["owner/repoA", "owner/repoB", "owner/repoC"],
        getSchedulerRepoConfig,
      });

      helpers.getOrInitRegistry();
      // 3 repos x 3 task types = 9 entries created, but the config should
      // still only be fetched once for the whole call - not 9 times.
      expect(getSchedulerRepoConfig).toHaveBeenCalledTimes(1);

      helpers.getOrInitRegistry();
      // A second call (every entry now pre-existing, so it takes the
      // recomputeEntryConfig branch instead) must also fetch only once.
      expect(getSchedulerRepoConfig).toHaveBeenCalledTimes(2);
    });

    test("When called again after a repo is added, Then it adds only the missing entries without touching existing ones", () => {
      helpers.getOrInitRegistry();
      const entry = viewPrsSchedulerState.dispatcher.entries["owner/repoA::autoRefresh"];
      entry.nextDueAt = iso(BASE_MS + 999);
      entry.runCount = 7;

      helpers = makeHelpers({
        getViewPrsAutoRefreshRepos: () => ["owner/repoA", "owner/repoB"],
      });
      const entries = helpers.getOrInitRegistry();

      expect(Object.keys(entries)).toContain("owner/repoB::quickCheck");
      expect(entries["owner/repoA::autoRefresh"].nextDueAt).toBe(iso(BASE_MS + 999));
      expect(entries["owner/repoA::autoRefresh"].runCount).toBe(7);
    });

    test("When a repo drops out of getViewPrsAutoRefreshRepos, Then its entries are pruned on the next call (no leak)", () => {
      helpers = makeHelpers({
        getViewPrsAutoRefreshRepos: () => ["owner/repoA", "owner/repoB"],
      });
      helpers.getOrInitRegistry();
      expect(Object.keys(viewPrsSchedulerState.dispatcher.entries)).toHaveLength(6);

      helpers = makeHelpers({
        getViewPrsAutoRefreshRepos: () => ["owner/repoA"],
      });
      const entries = helpers.getOrInitRegistry();

      expect(Object.keys(entries).sort()).toEqual([
        "owner/repoA::autoRefresh",
        "owner/repoA::mergedDrain",
        "owner/repoA::quickCheck",
      ]);
      expect(
        Object.values(entries).some((entry) => entry.repo === "owner/repoB"),
      ).toBe(false);
    });

    test("When a dropped repo's entry is still running, Then it is not pruned until it finishes", () => {
      helpers = makeHelpers({
        getViewPrsAutoRefreshRepos: () => ["owner/repoA", "owner/repoB"],
      });
      helpers.getOrInitRegistry();
      const runningEntry = viewPrsSchedulerState.dispatcher.entries["owner/repoB::autoRefresh"];
      helpers.markEntryRunning(runningEntry, { nowMs: BASE_MS });

      helpers = makeHelpers({
        getViewPrsAutoRefreshRepos: () => ["owner/repoA"],
      });
      let entries = helpers.getOrInitRegistry();
      // The running repoB::autoRefresh entry survives this call...
      expect(entries["owner/repoB::autoRefresh"]).toBeDefined();
      // ...but its repoB::quickCheck/mergedDrain siblings (not running) are
      // pruned immediately, since pruning is per-entry, not per-repo.
      expect(entries["owner/repoB::quickCheck"]).toBeUndefined();

      helpers.markEntryFinished(runningEntry, { nowMs: BASE_MS, ok: true });
      entries = helpers.getOrInitRegistry();
      expect(entries["owner/repoB::autoRefresh"]).toBeUndefined();
    });

    test("When schedulerRepoConfig changes between calls, Then an existing entry's priority/interval update in place", () => {
      helpers.getOrInitRegistry();
      schedulerRepoConfig = { "owner/repoA": { priority: 9, autoRefreshIntervalMs: 60000 } };

      const entries = helpers.getOrInitRegistry();

      expect(entries["owner/repoA::autoRefresh"].priority).toBe(9);
      expect(entries["owner/repoA::autoRefresh"].intervalMs).toBe(60000);
      // priority is repo-wide (not per-task) per schedulerRepoConfig's shape,
      // so the untouched task type picks up the same overridden priority -
      // only its interval stays at the default since no *Interval override
      // was given for it.
      expect(entries["owner/repoA::quickCheck"].priority).toBe(9);
      expect(entries["owner/repoA::quickCheck"].intervalMs).toBe(DEFAULT_INTERVALS.quickCheck);
    });

    test("When schedulerRepoConfig has an invalid override, Then it falls back to the default instead of throwing", () => {
      schedulerRepoConfig = { "owner/repoA": { priority: -3, autoRefreshIntervalMs: "not-a-number" } };

      const entries = helpers.getOrInitRegistry();

      expect(entries["owner/repoA::autoRefresh"].priority).toBe(3);
      expect(entries["owner/repoA::autoRefresh"].intervalMs).toBe(DEFAULT_INTERVALS.autoRefresh);
      expect(mockConsole.warn).toHaveBeenCalledWith(expect.stringContaining("priority"));
      expect(mockConsole.warn).toHaveBeenCalledWith(expect.stringContaining("autoRefreshIntervalMs"));
    });
  });

  describe("Given getDueEntries / pickNextBatch ordering", () => {
    beforeEach(() => {
      helpers = makeHelpers({
        getViewPrsAutoRefreshRepos: () => ["owner/repoA", "owner/repoB"],
      });
      helpers.getOrInitRegistry();
    });

    test("When two entries are equally due, Then higher priority sorts first", () => {
      const entries = viewPrsSchedulerState.dispatcher.entries;
      // Every entry defaults to the same nextDueAt (BASE_MS) from init, so
      // lower every OTHER entry's priority below repoB::quickCheck's
      // default (5) to get an unambiguous, non-tied comparison.
      Object.values(entries).forEach((entry) => {
        entry.priority = 1;
      });
      entries["owner/repoB::quickCheck"].priority = 5;

      const due = helpers.getDueEntries({ nowMs: BASE_MS });

      expect(due[0].taskType).toBe("quickCheck");
      expect(due[0].repo).toBe("owner/repoB");
    });

    test("When two entries share priority, Then the older-overdue one (earlier nextDueAt) sorts first", () => {
      const entries = viewPrsSchedulerState.dispatcher.entries;
      entries["owner/repoA::autoRefresh"].priority = 3;
      entries["owner/repoB::autoRefresh"].priority = 3;
      entries["owner/repoA::autoRefresh"].nextDueAt = iso(BASE_MS - 5000);
      entries["owner/repoB::autoRefresh"].nextDueAt = iso(BASE_MS - 1000);

      const due = helpers
        .getDueEntries({ nowMs: BASE_MS })
        .filter((entry) => entry.taskType === "autoRefresh");

      expect(due[0].repo).toBe("owner/repoA");
    });

    test("When an entry's nextDueAt is in the future, Then it is excluded from due entries", () => {
      viewPrsSchedulerState.dispatcher.entries["owner/repoA::autoRefresh"].nextDueAt =
        iso(BASE_MS + 60000);

      const due = helpers.getDueEntries({ nowMs: BASE_MS });

      expect(due.some((entry) => entry.repo === "owner/repoA" && entry.taskType === "autoRefresh")).toBe(false);
    });

    test("When an entry isRunning, Then it is excluded from due entries even if its nextDueAt has passed", () => {
      viewPrsSchedulerState.dispatcher.entries["owner/repoA::autoRefresh"].isRunning = true;

      const due = helpers.getDueEntries({ nowMs: BASE_MS });

      expect(due.some((entry) => entry.repo === "owner/repoA" && entry.taskType === "autoRefresh")).toBe(false);
    });

    test("When a repo's circuit breaker is open, Then ALL of its due entries (every task type) are excluded, but a different repo's are not", () => {
      helpers = makeHelpers({
        getViewPrsAutoRefreshRepos: () => ["owner/repoA", "owner/repoB"],
        getOpenAutoCircuitRepos: () => ["owner/repoA"],
      });
      helpers.getOrInitRegistry();

      const due = helpers.getDueEntries({ nowMs: BASE_MS });

      expect(due.some((entry) => entry.repo === "owner/repoA")).toBe(false);
      expect(due.some((entry) => entry.repo === "owner/repoB")).toBe(true);
    });
  });

  describe("Given pickNextBatch's concurrency/rate-limit budget", () => {
    beforeEach(() => {
      helpers = makeHelpers({
        getViewPrsAutoRefreshRepos: () => ["owner/repoA", "owner/repoB"],
        ghCostByTaskType: { quickCheck: 1, autoRefresh: 4, mergedDrain: 4 },
      });
      helpers.getOrInitRegistry();
    });

    test("When the budget covers every due entry, Then all are selected and none are skipped", () => {
      const { selected, skippedForBudget } = helpers.pickNextBatch({
        nowMs: BASE_MS,
        availableGhSlots: 100,
      });

      expect(selected.length).toBe(6);
      expect(skippedForBudget.length).toBe(0);
    });

    test("When the budget is exhausted partway through, Then lower-priority-or-later entries are skipped, not dropped", () => {
      const entries = viewPrsSchedulerState.dispatcher.entries;
      entries["owner/repoA::quickCheck"].priority = 9;
      entries["owner/repoB::quickCheck"].priority = 8;
      entries["owner/repoA::autoRefresh"].priority = 7;

      const { selected, skippedForBudget } = helpers.pickNextBatch({
        nowMs: BASE_MS,
        availableGhSlots: 2,
      });

      expect(selected.map((e) => `${e.repo}::${e.taskType}`)).toEqual([
        "owner/repoA::quickCheck",
        "owner/repoB::quickCheck",
      ]);
      expect(skippedForBudget.length).toBe(4);
    });

    test("When availableGhSlots is 0, Then nothing is selected", () => {
      const { selected } = helpers.pickNextBatch({ nowMs: BASE_MS, availableGhSlots: 0 });
      expect(selected).toEqual([]);
    });
  });

  describe("Given markEntryRunning / markEntryFinished", () => {
    beforeEach(() => {
      helpers.getOrInitRegistry();
    });

    test("When an entry finishes ok, Then isRunning clears, consecutiveFailureCount resets, and nextDueAt is now + intervalMs", () => {
      const entry = viewPrsSchedulerState.dispatcher.entries["owner/repoA::autoRefresh"];
      entry.consecutiveFailureCount = 2;
      helpers.markEntryRunning(entry, { nowMs: BASE_MS });
      expect(entry.isRunning).toBe(true);

      helpers.markEntryFinished(entry, { nowMs: BASE_MS + 1000, ok: true });

      expect(entry.isRunning).toBe(false);
      expect(entry.consecutiveFailureCount).toBe(0);
      expect(entry.lastOk).toBe(true);
      expect(entry.nextDueAt).toBe(iso(BASE_MS + 1000 + entry.intervalMs));
    });

    test("When an entry fails repeatedly, Then nextDueAt backs off further each time, capped at 4x the interval", () => {
      const entry = viewPrsSchedulerState.dispatcher.entries["owner/repoA::quickCheck"];
      const interval = entry.intervalMs;

      helpers.markEntryFinished(entry, { nowMs: BASE_MS, ok: false, error: "boom" });
      expect(entry.nextDueAt).toBe(iso(BASE_MS + interval * 2));

      helpers.markEntryFinished(entry, { nowMs: BASE_MS, ok: false, error: "boom" });
      expect(entry.nextDueAt).toBe(iso(BASE_MS + interval * 3));

      // 10 more consecutive failures - backoff must not exceed 4x.
      for (let i = 0; i < 10; i += 1) {
        helpers.markEntryFinished(entry, { nowMs: BASE_MS, ok: false, error: "boom" });
      }
      expect(entry.nextDueAt).toBe(iso(BASE_MS + interval * 4));
      expect(entry.lastError).toBe("boom");
    });
  });

  describe("Given markEntryDeferred (a call that was skipped, not run)", () => {
    beforeEach(() => {
      helpers.getOrInitRegistry();
    });

    test("When an entry is deferred, Then isRunning clears, consecutiveFailureCount is untouched, and nextDueAt is a short retry - not the full interval", () => {
      const entry = viewPrsSchedulerState.dispatcher.entries["owner/repoA::autoRefresh"];
      entry.consecutiveFailureCount = 2;
      helpers.markEntryRunning(entry, { nowMs: BASE_MS });

      helpers.markEntryDeferred(entry, { nowMs: BASE_MS + 1000, skipReason: "already-in-progress" });

      expect(entry.isRunning).toBe(false);
      expect(entry.consecutiveFailureCount).toBe(2);
      expect(entry.lastSkipReason).toBe("already-in-progress");
      const nextDueMs = new Date(entry.nextDueAt).getTime();
      expect(nextDueMs).toBeGreaterThan(BASE_MS + 1000);
      expect(nextDueMs).toBeLessThan(BASE_MS + 1000 + entry.intervalMs);
    });
  });

  describe("Given bumpEntryUrgent (the mechanism behind both fast-follow cases)", () => {
    beforeEach(() => {
      helpers.getOrInitRegistry();
    });

    test("When called, Then the entry's nextDueAt becomes immediately due regardless of its prior schedule", () => {
      const entry = viewPrsSchedulerState.dispatcher.entries["owner/repoA::mergedDrain"];
      entry.nextDueAt = iso(BASE_MS + 30 * 60 * 1000);
      clockMs = BASE_MS + 10;

      const bumped = helpers.bumpEntryUrgent("owner/repoA", "mergedDrain", {
        reason: "quick-check-pending-merged-closed",
      });

      expect(bumped.nextDueAt).toBe(iso(clockMs));
      expect(helpers.getDueEntries({ nowMs: clockMs })).toContainEqual(
        expect.objectContaining({ repo: "owner/repoA", taskType: "mergedDrain" }),
      );
    });

    test("When a bumped mergedDrain entry is due, Then it is picked ahead of a non-bumped autoRefresh entry with a higher baseline priority (the actual bug-fix regression test)", () => {
      const entries = viewPrsSchedulerState.dispatcher.entries;
      entries["owner/repoA::autoRefresh"].priority = 9;
      entries["owner/repoA::autoRefresh"].nextDueAt = iso(BASE_MS + 999999);
      entries["owner/repoA::mergedDrain"].priority = 1;
      entries["owner/repoA::mergedDrain"].nextDueAt = iso(BASE_MS + 999999);
      // quickCheck also defaults to due-now from init - push it out too so
      // the only due entry before the bump is none, isolating the
      // comparison to just autoRefresh (not-due) vs mergedDrain (bumped).
      entries["owner/repoA::quickCheck"].nextDueAt = iso(BASE_MS + 999999);

      helpers.bumpEntryUrgent("owner/repoA", "mergedDrain", { reason: "test" });

      const due = helpers.getDueEntries({ nowMs: BASE_MS });
      expect(due).toHaveLength(1);
      expect(due[0].taskType).toBe("mergedDrain");
    });

    test("When called for an entry that doesn't exist, Then it returns null without throwing", () => {
      expect(() => helpers.bumpEntryUrgent("owner/unknown", "autoRefresh")).not.toThrow();
      expect(helpers.bumpEntryUrgent("owner/unknown", "autoRefresh")).toBeNull();
    });
  });

  describe("Given getDispatcherQueueSnapshot", () => {
    beforeEach(() => {
      helpers = makeHelpers({
        getViewPrsAutoRefreshRepos: () => ["owner/repoA", "owner/repoB"],
      });
      helpers.getOrInitRegistry();
    });

    test("When entries are running/due/scheduled, Then the snapshot sorts running first, then due by priority desc, then scheduled soonest-first", () => {
      const entries = viewPrsSchedulerState.dispatcher.entries;
      entries["owner/repoA::autoRefresh"].isRunning = true;
      entries["owner/repoB::quickCheck"].priority = 9;
      entries["owner/repoB::quickCheck"].nextDueAt = iso(BASE_MS);
      entries["owner/repoA::quickCheck"].priority = 1;
      entries["owner/repoA::quickCheck"].nextDueAt = iso(BASE_MS);
      entries["owner/repoA::mergedDrain"].nextDueAt = iso(BASE_MS + 5000);
      entries["owner/repoB::mergedDrain"].nextDueAt = iso(BASE_MS + 1000);
      entries["owner/repoB::autoRefresh"].nextDueAt = iso(BASE_MS + 999999);

      const snapshot = helpers.getDispatcherQueueSnapshot({ limit: 20 });

      expect(snapshot[0]).toMatchObject({ repo: "owner/repoA", taskType: "autoRefresh", status: "running" });
      expect(snapshot[1]).toMatchObject({ repo: "owner/repoB", taskType: "quickCheck", status: "due" });
      expect(snapshot[2]).toMatchObject({ repo: "owner/repoA", taskType: "quickCheck", status: "due" });
      const scheduled = snapshot.slice(3).map((e) => `${e.repo}::${e.taskType}`);
      expect(scheduled).toEqual([
        "owner/repoB::mergedDrain",
        "owner/repoA::mergedDrain",
        "owner/repoB::autoRefresh",
      ]);
    });

    test("When there are more entries than the limit, Then the snapshot is capped", () => {
      const snapshot = helpers.getDispatcherQueueSnapshot({ limit: 2 });
      expect(snapshot).toHaveLength(2);
    });

    test("When a repo's circuit breaker is open, Then its due/scheduled entries show status circuit-open, sorted after running but before due/scheduled", () => {
      helpers = makeHelpers({
        getViewPrsAutoRefreshRepos: () => ["owner/repoA", "owner/repoB"],
        getOpenAutoCircuitRepos: () => ["owner/repoA"],
      });
      helpers.getOrInitRegistry();
      const entries = viewPrsSchedulerState.dispatcher.entries;
      entries["owner/repoB::quickCheck"].isRunning = true;
      entries["owner/repoB::autoRefresh"].nextDueAt = iso(BASE_MS);

      const snapshot = helpers.getDispatcherQueueSnapshot({ limit: 20 });

      const repoAStatuses = snapshot
        .filter((entry) => entry.repo === "owner/repoA")
        .map((entry) => entry.status);
      expect(repoAStatuses).toEqual(["circuit-open", "circuit-open", "circuit-open"]);
      // running still sorts ahead of circuit-open.
      expect(snapshot[0]).toMatchObject({ repo: "owner/repoB", status: "running" });
      // circuit-open sorts ahead of a genuinely-due different repo's entry.
      const circuitOpenIndex = snapshot.findIndex((entry) => entry.status === "circuit-open");
      const dueIndex = snapshot.findIndex((entry) => entry.status === "due");
      expect(circuitOpenIndex).toBeLessThan(dueIndex);
    });
  });

  describe("Given isAnyEntryRunning / latestFinishedAtAcrossEntries (backward-compat derived fields)", () => {
    beforeEach(() => {
      helpers = makeHelpers({
        getViewPrsAutoRefreshRepos: () => ["owner/repoA", "owner/repoB"],
      });
      helpers.getOrInitRegistry();
    });

    test("isAnyEntryRunning reflects running state across repos for a given taskType only", () => {
      expect(helpers.isAnyEntryRunning("autoRefresh")).toBe(false);
      viewPrsSchedulerState.dispatcher.entries["owner/repoB::autoRefresh"].isRunning = true;
      expect(helpers.isAnyEntryRunning("autoRefresh")).toBe(true);
      expect(helpers.isAnyEntryRunning("quickCheck")).toBe(false);
    });

    test("latestFinishedAtAcrossEntries returns the max lastFinishedAt across that taskType's entries, or null", () => {
      expect(helpers.latestFinishedAtAcrossEntries("autoRefresh")).toBeNull();
      viewPrsSchedulerState.dispatcher.entries["owner/repoA::autoRefresh"].lastFinishedAt = iso(BASE_MS);
      viewPrsSchedulerState.dispatcher.entries["owner/repoB::autoRefresh"].lastFinishedAt = iso(BASE_MS + 5000);

      expect(helpers.latestFinishedAtAcrossEntries("autoRefresh")).toBe(iso(BASE_MS + 5000));
    });
  });

  describe("Given getPublicStateFields", () => {
    test("When called, Then it bundles the derived isXInProgress/lastXAt fields and the dispatcherQueue snapshot in one object", () => {
      helpers = makeHelpers({
        getViewPrsAutoRefreshRepos: () => ["owner/repoA"],
      });
      helpers.getOrInitRegistry();
      viewPrsSchedulerState.dispatcher.entries["owner/repoA::autoRefresh"].isRunning = true;
      viewPrsSchedulerState.dispatcher.entries["owner/repoA::quickCheck"].lastFinishedAt = iso(BASE_MS);

      const fields = helpers.getPublicStateFields();

      expect(fields.isAutoRunInProgress).toBe(true);
      expect(fields.isQuickCheckInProgress).toBe(false);
      expect(fields.isMergedDrainInProgress).toBe(false);
      expect(fields.lastQuickCheckAt).toBe(iso(BASE_MS));
      expect(fields.lastAutoRunAt).toBeNull();
      expect(fields.lastMergedDrainAt).toBeNull();
      expect(Array.isArray(fields.dispatcherQueue)).toBe(true);
      expect(fields.dispatcherQueue).toHaveLength(3);
    });
  });

  describe("Given migrateLegacyPersistedState", () => {
    test("When given the old flat shape, Then it builds one entry per (repo, taskType) with lastFinishedAt mapped from the matching legacy field", () => {
      const legacy = {
        lastManualRunAt: iso(BASE_MS - 1000),
        lastAutoRunAt: iso(BASE_MS - 2000),
        lastQuickCheckAt: iso(BASE_MS - 3000),
        lastMergedDrainAt: null,
        pendingByRepo: { "owner/repoA": { open: ["1"], mergedClosed: [] } },
      };

      const { entries, pendingByRepo } = helpers.migrateLegacyPersistedState(legacy, {
        repos: ["owner/repoA"],
        nowMs: BASE_MS,
      });

      expect(entries["owner/repoA::autoRefresh"].lastFinishedAt).toBe(iso(BASE_MS - 2000));
      expect(entries["owner/repoA::autoRefresh"].nextDueAt).toBe(
        iso(BASE_MS - 2000 + DEFAULT_INTERVALS.autoRefresh),
      );
      expect(entries["owner/repoA::quickCheck"].lastFinishedAt).toBe(iso(BASE_MS - 3000));
      // No legacy timestamp at all for mergedDrain -> immediately due, not
      // waiting out a full interval after the upgrade.
      expect(entries["owner/repoA::mergedDrain"].lastFinishedAt).toBeNull();
      expect(entries["owner/repoA::mergedDrain"].nextDueAt).toBe(iso(BASE_MS));
      expect(pendingByRepo).toEqual(legacy.pendingByRepo);
    });

    test("When legacyShape.pendingByRepo is missing or malformed, Then it falls back to an empty object", () => {
      const { pendingByRepo } = helpers.migrateLegacyPersistedState(
        { lastAutoRunAt: null },
        { repos: [], nowMs: BASE_MS },
      );
      expect(pendingByRepo).toEqual({});
    });
  });

  describe("Given reserveGhSlots / releaseGhSlots (non-blocking manual-route budget sharing)", () => {
    test("When reserved then released, Then the counter returns to 0 and never goes negative", () => {
      expect(helpers.getReservedGhSlots()).toBe(0);
      helpers.reserveGhSlots(3);
      expect(helpers.getReservedGhSlots()).toBe(3);
      helpers.releaseGhSlots(1);
      expect(helpers.getReservedGhSlots()).toBe(2);
      helpers.releaseGhSlots(10);
      expect(helpers.getReservedGhSlots()).toBe(0);
    });
  });

  describe("Given getRunningGhCost (budget accounting for ticks that outlive their own claim phase)", () => {
    beforeEach(() => {
      helpers = makeHelpers({
        getViewPrsAutoRefreshRepos: () => ["owner/repoA", "owner/repoB"],
        ghCostByTaskType: { quickCheck: 1, autoRefresh: 4, mergedDrain: 4 },
      });
      helpers.getOrInitRegistry();
    });

    test("When no entry is running, Then it is 0", () => {
      expect(helpers.getRunningGhCost()).toBe(0);
    });

    test("When some entries are running, Then it sums only their cost by task type", () => {
      const entries = viewPrsSchedulerState.dispatcher.entries;
      helpers.markEntryRunning(entries["owner/repoA::autoRefresh"], { nowMs: BASE_MS });
      helpers.markEntryRunning(entries["owner/repoB::quickCheck"], { nowMs: BASE_MS });

      // autoRefresh (4) + quickCheck (1) - every other entry stays idle and
      // doesn't contribute, confirming this isn't just "sum everything".
      expect(helpers.getRunningGhCost()).toBe(5);
    });

    test("When an entry finishes, Then it stops counting toward the running cost", () => {
      const entries = viewPrsSchedulerState.dispatcher.entries;
      helpers.markEntryRunning(entries["owner/repoA::autoRefresh"], { nowMs: BASE_MS });
      expect(helpers.getRunningGhCost()).toBe(4);

      helpers.markEntryFinished(entries["owner/repoA::autoRefresh"], { nowMs: BASE_MS, ok: true });
      expect(helpers.getRunningGhCost()).toBe(0);
    });
  });
});
