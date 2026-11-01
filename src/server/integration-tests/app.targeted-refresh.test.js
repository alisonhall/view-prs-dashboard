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

describe("the manual cooldown, per repo", () => {
  const OTHER = "owner/repo-other";
  const recently = () => new Date(Date.now() - 5 * 60 * 1000).toISOString();
  let scriptCalls;
  beforeEach(() => {
    scriptCalls = [];
    viewPrsSchedulerState.manualFullRunAtByRepo = {};
    appModule.runViewPrsScript = async (args) => {
      scriptCalls.push(args);
      return { stdout: "", stderr: "" };
    };
  });
  afterAll(() => {
    viewPrsSchedulerState.manualFullRunAtByRepo = {};
  });

  test("only a manual run of a whole repo records it, and one with no --repo (\"*\") counts for every repo", () => {
    appModule.setLastManualRunNow();
    expect(appModule.getManualFullRunAtForRepo(REPO)).toBeNull();
    expect(viewPrsSchedulerState.lastManualRunAt).toBeTruthy();

    appModule.setLastManualRunNow({ fullRunRepo: REPO });
    expect(appModule.getManualFullRunAtForRepo(REPO)).toBe(viewPrsSchedulerState.lastManualRunAt);
    expect(appModule.getManualFullRunAtForRepo(OTHER)).toBeNull();

    viewPrsSchedulerState.manualFullRunAtByRepo = { "*": recently() };
    expect(appModule.getManualFullRunAtForRepo(OTHER)).toBe(viewPrsSchedulerState.manualFullRunAtByRepo["*"]);
  });

  test("holds off that repo's full refresh, not another repo's", async () => {
    viewPrsSchedulerState.manualFullRunAtByRepo = { [OTHER]: recently() };

    const result = await runViewPrsAutoRefresh({ reposOverride: [REPO, OTHER] });

    expect(scriptCalls).toHaveLength(1);
    expect(scriptCalls[0]).toEqual(expect.arrayContaining(["--repo", REPO]));
    expect(result).toMatchObject({ succeededRepos: [REPO], reposExcludedForManualCooldown: [OTHER] });
  });

  test("doesn't hold off a refresh of chosen PRs - changes found since", async () => {
    viewPrsSchedulerState.manualFullRunAtByRepo = { [REPO]: recently() };

    const result = await runViewPrsAutoRefresh({
      reposOverride: [REPO],
      prNumbersByRepo: { [REPO]: ["12"] },
    });

    expect(scriptCalls[0]).toEqual(expect.arrayContaining(["--prs", "12"]));
    expect(result).toMatchObject({ succeededRepos: [REPO], targetedRepos: [REPO] });

    expect(await runViewPrsAutoRefresh({ reposOverride: [REPO] })).toEqual({
      skipped: true,
      skipReason: "manual-cooldown",
    });
  });

  describe("POST /run", () => {
    const supertest = require("supertest");
    let server;
    beforeEach(() => {
      server = appModule.createViewPrsApp().listen(0);
    });
    afterEach(async () => {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    });

    test("of one PR takes just it off the queue, and doesn't start the repo's cooldown", async () => {
      setPendingForRepo(REPO, { open: [12, 13], mergedClosed: [] });

      const res = await supertest(server).post("/run").send({ repo: REPO, prNumber: "12", openMode: "none" });

      expect(res.status).toBe(200);
      expect(getPendingForRepo(REPO)).toEqual({ open: ["13"], mergedClosed: [] });
      expect(appModule.getManualFullRunAtForRepo(REPO)).toBeNull();
    });

    test("fetches every PR in full - none reused as stored, as the background sweep does", async () => {
      const calls = [];
      appModule.runViewPrsScript = async (args, _maxBuffer, options) => {
        calls.push({ args, options });
        return { stdout: "", stderr: "" };
      };

      const res = await supertest(server).post("/run").send({ repo: REPO, openMode: "none" });

      expect(res.status).toBe(200);
      expect(calls[0].options.env).toEqual({ VIEW_PRS_SKIP_UNCHANGED: "0" });
    });

    test("of a whole repo clears its queue and starts its cooldown", async () => {
      setPendingForRepo(REPO, { open: [12], mergedClosed: [] });

      const res = await supertest(server).post("/run").send({ repo: REPO, openMode: "none" });

      expect(res.status).toBe(200);
      expect(viewPrsSchedulerState.pendingByRepo[REPO]).toBeUndefined();
      expect(appModule.getManualFullRunAtForRepo(REPO)).toBeTruthy();
    });
  });
});

describe("a quick check of entered numbers", () => {
  const savedRunDispatcherTick = appModule.runDispatcherTick;
  let pendingFromScript;
  beforeEach(() => {
    pendingFromScript = { pendingOpen: [], pendingMergedClosed: [] };
    appModule.runViewPrsScript = async () => ({ stdout: JSON.stringify(pendingFromScript), stderr: "" });
    appModule.runDispatcherTick = async () => {};
  });
  afterAll(() => {
    appModule.runDispatcherTick = savedRunDispatcherTick;
  });

  test("finding them unchanged takes just them off the queue", async () => {
    setPendingForRepo(REPO, { open: [12, 13], mergedClosed: [40] });

    await appModule.runViewPrsQuickCheck({ repo: REPO, prNumbers: "12,40" });

    expect(getPendingForRepo(REPO)).toEqual({ open: ["13"], mergedClosed: [] });
  });

  test("finding one changed keeps it queued, and drops the ones found unchanged", async () => {
    setPendingForRepo(REPO, { open: [12, 13], mergedClosed: [] });
    pendingFromScript = { pendingOpen: [13], pendingMergedClosed: [] };

    await appModule.runViewPrsQuickCheck({ repo: REPO, prNumbers: "12,13" });

    expect(getPendingForRepo(REPO)).toEqual({ open: ["13"], mergedClosed: [] });
  });

  test("a check of the whole repo that finds nothing changed still clears its queue", async () => {
    setPendingForRepo(REPO, { open: [12], mergedClosed: [] });

    await appModule.runViewPrsQuickCheck({ repoRequests: [{ repo: REPO }] });

    expect(viewPrsSchedulerState.pendingByRepo[REPO]).toBeUndefined();
  });
});
