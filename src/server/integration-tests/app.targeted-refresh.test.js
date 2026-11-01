// Refreshing only the PRs a quick check found changed (step 2 of the data-
// freshness plan in ROADMAP.md): the script's --prs, the pending queue
// cleared PR by PR, and the dispatcher's fast-follow keeping the full
// sweep's time.
const fs = require("fs");
const appModule = require("../app.js");

const {
  viewPrsSchedulerState,
  viewPrsSchedulerFile,
  dispatcherHelpers,
  runDispatcherTick,
  runViewPrsAutoRefresh,
  runViewPrsMergedQueueDrain,
  setPendingForRepo,
  clearPendingNumbersForRepo,
  getPendingForRepo,
} = appModule;

jest.setTimeout(20000);

const REPO = "owner/repo-targeted";
const savedAutoRepos = process.env.VIEW_PRS_AUTO_REPOS;
const savedRunViewPrsScript = appModule.runViewPrsScript;
const savedRunViewPrsAutoRefresh = appModule.runViewPrsAutoRefresh;
const savedGetDependencyStatus = appModule.getDependencyStatus;

const resetState = () => {
  viewPrsSchedulerState.dispatcher = { entries: {}, reservedGhSlots: 0 };
  viewPrsSchedulerState.autoRefreshInProgressRepos = new Set();
  viewPrsSchedulerState.quickCheckSkippedRepos = new Set();
  viewPrsSchedulerState.quickCheckInProgressRepos = new Set();
  viewPrsSchedulerState.isAutoRunInProgress = false;
  viewPrsSchedulerState.isQuickCheckInProgress = false;
  viewPrsSchedulerState.isMergedDrainInProgress = false;
  viewPrsSchedulerState.pendingByRepo = {};
  viewPrsSchedulerState.autoCircuitByRepo = {};
  fs.rmSync(viewPrsSchedulerFile, { force: true });
};

beforeEach(() => {
  resetState();
  process.env.VIEW_PRS_AUTO_REPOS = REPO;
  appModule.getDependencyStatus = () => ({ ok: true, missing: [] });
});

afterAll(() => {
  resetState();
  if (savedAutoRepos === undefined) delete process.env.VIEW_PRS_AUTO_REPOS;
  else process.env.VIEW_PRS_AUTO_REPOS = savedAutoRepos;
  appModule.runViewPrsScript = savedRunViewPrsScript;
  appModule.runViewPrsAutoRefresh = savedRunViewPrsAutoRefresh;
  appModule.getDependencyStatus = savedGetDependencyStatus;
});

describe("the pending queue, PR by PR", () => {
  test("clearing some numbers keeps the rest queued, and an emptied repo leaves the queue", () => {
    setPendingForRepo(REPO, { open: [12, 13], mergedClosed: [40] });

    clearPendingNumbersForRepo(REPO, ["12", "40"]);
    expect(getPendingForRepo(REPO)).toEqual({ open: ["13"], mergedClosed: [] });

    clearPendingNumbersForRepo(REPO, ["13"]);
    expect(viewPrsSchedulerState.pendingByRepo[REPO]).toBeUndefined();
    expect(getPendingForRepo(REPO)).toEqual({ open: [], mergedClosed: [] });
  });
});

describe("the last run and the last full run", () => {
  const dataFile = process.env.VIEW_PRS_DATA_FILE;
  afterEach(() => fs.rmSync(dataFile, { force: true }));

  test("both reach the page, and data from before lastFullRun takes its lastRun as one", () => {
    const lastRun = { repo: REPO, updatedAt: "2026-10-31T10:00:00Z" };
    const lastFullRun = { repo: REPO, updatedAt: "2026-10-31T09:45:00Z" };
    fs.writeFileSync(dataFile, JSON.stringify({ byPrNumber: {}, lastRun, lastFullRun }));
    expect(appModule.readViewPrsData()).toMatchObject({ lastRun, lastFullRun });

    fs.writeFileSync(dataFile, JSON.stringify({ byPrNumber: {}, lastRun }));
    expect(appModule.readViewPrsData()).toMatchObject({ lastRun, lastFullRun: lastRun });
  });
});

describe("runViewPrsAutoRefresh with prNumbersByRepo", () => {
  let scriptCalls;
  beforeEach(() => {
    scriptCalls = [];
    appModule.runViewPrsScript = async (args) => {
      scriptCalls.push(args);
      return { stdout: "", stderr: "" };
    };
  });

  test("refreshes only those PRs, and clears only those from the queue", async () => {
    setPendingForRepo(REPO, { open: [12, 13], mergedClosed: [] });

    const result = await runViewPrsAutoRefresh({
      skipCooldownChecks: true,
      reposOverride: [REPO],
      prNumbersByRepo: { [REPO]: ["12"] },
    });

    expect(scriptCalls).toHaveLength(1);
    expect(scriptCalls[0]).toEqual(expect.arrayContaining(["--repo", REPO, "--prs", "12"]));
    expect(result).toMatchObject({ succeededRepos: [REPO], targetedRepos: [REPO] });
    // 13 was queued but not refreshed.
    expect(getPendingForRepo(REPO)).toEqual({ open: ["13"], mergedClosed: [] });
  });

  test("without numbers for a repo, it's the full refresh, which clears the repo's queue", async () => {
    setPendingForRepo(REPO, { open: [12], mergedClosed: [40] });

    const result = await runViewPrsAutoRefresh({ skipCooldownChecks: true, reposOverride: [REPO] });

    expect(scriptCalls[0]).not.toContain("--prs");
    expect(result).toMatchObject({ succeededRepos: [REPO], targetedRepos: [] });
    expect(viewPrsSchedulerState.pendingByRepo[REPO]).toBeUndefined();
  });
});

describe("the merged/closed drain", () => {
  test("refreshes just the queued merged/closed PRs, or the whole repo when too many are queued", async () => {
    const calls = [];
    appModule.runViewPrsAutoRefresh = async (args) => {
      calls.push(args);
      return { skipped: false, succeededRepos: [REPO], targetedRepos: [], failedRepos: [] };
    };

    setPendingForRepo(REPO, { open: [], mergedClosed: [40, 41] });
    await runViewPrsMergedQueueDrain({ reposOverride: [REPO] });
    expect(calls[0]).toEqual({ reposOverride: [REPO], prNumbersByRepo: { [REPO]: ["40", "41"] } });

    setPendingForRepo(REPO, { open: [], mergedClosed: Array.from({ length: 26 }, (_, index) => 100 + index) });
    await runViewPrsMergedQueueDrain({ reposOverride: [REPO] });
    expect(calls[1]).toEqual({ reposOverride: [REPO], prNumbersByRepo: {} });
  });
});

describe("the dispatcher's fast-follow", () => {
  const sweepDueAt = () => new Date(Date.now() + 10 * 60 * 1000).toISOString();
  let calls;

  // Registers the repo with only its auto refresh due-able, its sweep 10
  // minutes off, and stands in for runViewPrsAutoRefresh.
  const setUp = () => {
    calls = [];
    appModule.runViewPrsAutoRefresh = async (args) => {
      calls.push(args);
      return {
        skipped: false,
        succeededRepos: [REPO],
        targetedRepos: args.prNumbersByRepo?.[REPO] ? [REPO] : [],
        failedRepos: [],
      };
    };
    dispatcherHelpers.getOrInitRegistry();
    const entries = viewPrsSchedulerState.dispatcher.entries;
    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    entries[`${REPO}::quickCheck`].nextDueAt = farFuture;
    entries[`${REPO}::mergedDrain`].nextDueAt = farFuture;
    const entry = entries[`${REPO}::autoRefresh`];
    entry.nextDueAt = sweepDueAt();
    return entry;
  };
  const tickAndSettle = async () => {
    await runDispatcherTick();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  };

  test("refreshes just the queued PRs, open and merged/closed, and puts the sweep back to its time", async () => {
    const entry = setUp();
    const scheduledSweep = entry.nextDueAt;
    setPendingForRepo(REPO, { open: [12], mergedClosed: [40] });
    dispatcherHelpers.bumpEntryUrgent(REPO, "autoRefresh", { reason: "quick-check-pending-open" });

    await tickAndSettle();

    expect(calls).toEqual([{ reposOverride: [REPO], prNumbersByRepo: { [REPO]: ["12", "40"] } }]);
    expect(entry.isRunning).toBe(false);
    expect(entry.nextDueAt).toBe(scheduledSweep);
  });

  test("a repo with too many queued PRs gets its full refresh, which reschedules the sweep from now", async () => {
    const entry = setUp();
    const scheduledSweep = entry.nextDueAt;
    setPendingForRepo(REPO, { open: Array.from({ length: 26 }, (_, index) => 100 + index), mergedClosed: [] });
    dispatcherHelpers.bumpEntryUrgent(REPO, "autoRefresh", { reason: "quick-check-pending-open" });

    await tickAndSettle();

    expect(calls).toEqual([{ reposOverride: [REPO], prNumbersByRepo: {} }]);
    expect(Date.parse(entry.nextDueAt)).toBeGreaterThan(Date.parse(scheduledSweep));
  });

  test("with its queue emptied before it ran, it does nothing, and keeps the sweep's time", async () => {
    const entry = setUp();
    const scheduledSweep = entry.nextDueAt;
    setPendingForRepo(REPO, { open: [12], mergedClosed: [] });
    dispatcherHelpers.bumpEntryUrgent(REPO, "autoRefresh", { reason: "quick-check-pending-open" });
    // A manual run refreshed the repo in between.
    viewPrsSchedulerState.pendingByRepo = {};

    await tickAndSettle();

    expect(calls).toEqual([]);
    expect(entry.isRunning).toBe(false);
    expect(entry.lastOk).toBe(true);
    expect(entry.nextDueAt).toBe(scheduledSweep);
  });

  test("a manual \"run now\" stays a full refresh, though a quick check bumped it after", async () => {
    const entry = setUp();
    setPendingForRepo(REPO, { open: [12], mergedClosed: [] });
    dispatcherHelpers.bumpEntryUrgent(REPO, "autoRefresh", { reason: "manual" });
    dispatcherHelpers.bumpEntryUrgent(REPO, "autoRefresh", { reason: "quick-check-pending-open" });

    await tickAndSettle();

    expect(calls).toEqual([{ reposOverride: [REPO], prNumbersByRepo: {} }]);
    expect(entry.isRunning).toBe(false);
  });

  test("the sweep's own time is a full refresh, even with PRs queued", async () => {
    const entry = setUp();
    entry.nextDueAt = new Date(Date.now() - 1000).toISOString();
    setPendingForRepo(REPO, { open: [12], mergedClosed: [] });

    await tickAndSettle();

    expect(calls).toEqual([{ reposOverride: [REPO], prNumbersByRepo: {} }]);
  });
});
