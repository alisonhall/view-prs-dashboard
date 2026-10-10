const appModule = require("../app.js");
const {
  runViewPrsAutoRefresh,
  runViewPrsQuickCheck,
  runViewPrsMergedQueueDrain,
  resetViewPrsAutoRefreshFailureState,
  viewPrsSchedulerState,
} = appModule;

const resetSchedulerState = () => {
  viewPrsSchedulerState.isAutoRunInProgress = false;
  viewPrsSchedulerState.isQuickCheckInProgress = false;
  viewPrsSchedulerState.isMergedDrainInProgress = false;
  viewPrsSchedulerState.activePrNumbers = [];
  viewPrsSchedulerState.lastAutoAttemptAt = null;
  viewPrsSchedulerState.lastAutoSkipReason = null;
  viewPrsSchedulerState.lastAutoError = null;
  viewPrsSchedulerState.lastAutoRunAt = null;
  viewPrsSchedulerState.lastManualRunAt = null;
  viewPrsSchedulerState.lastQuickCheckAttemptAt = null;
  viewPrsSchedulerState.lastQuickCheckSkipReason = null;
  viewPrsSchedulerState.lastQuickCheckError = null;
  viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress = false;
  viewPrsSchedulerState.quickCheckSkippedRepos = new Set();
  viewPrsSchedulerState.autoRefreshInProgressRepos = new Set();
  viewPrsSchedulerState.quickCheckInProgressRepos = new Set();
  viewPrsSchedulerState.pendingByRepo = {};
  resetViewPrsAutoRefreshFailureState();
};

describe("scheduler job event emission", () => {
  const savedDependencyStatus = appModule.getDependencyStatus;
  const savedRunViewPrsScript = appModule.runViewPrsScript;
  const savedReadViewPrsData = appModule.readViewPrsData;
  const savedEmitJobEvent = appModule.emitJobEvent;

  let captured;

  beforeAll(() => {
    appModule.getDependencyStatus = () => ({ ok: true, missing: [] });
    appModule.runViewPrsScript = async () => ({ stdout: "{}", stderr: "" });
    appModule.readViewPrsData = () => ({ byPrNumber: {} });
  });

  afterAll(() => {
    const restore = (key, saved) => {
      if (saved !== undefined) {
        appModule[key] = saved;
      } else {
        delete appModule[key];
      }
    };
    restore("getDependencyStatus", savedDependencyStatus);
    restore("runViewPrsScript", savedRunViewPrsScript);
    restore("readViewPrsData", savedReadViewPrsData);
    restore("emitJobEvent", savedEmitJobEvent);
  });

  beforeEach(() => {
    resetSchedulerState();
    captured = [];
    appModule.emitJobEvent = (eventInput) => {
      captured.push(eventInput);
      return eventInput;
    };
  });

  test("a clean auto refresh emits start then finish with ok:true", async () => {
    const result = await runViewPrsAutoRefresh({ reposOverride: ["owner/repo-one"] });

    const phases = captured.map((event) => `${event.job}:${event.phase}`);
    expect(phases).toEqual(["autoRefresh:start", "autoRefresh:finish"]);
    expect(captured[1].ok).toBe(true);
    expect(result).toEqual({
      skipped: false,
      succeededRepos: ["owner/repo-one"],
      failedRepos: [],
      failedRepoErrors: {},
      reposExcludedForAlreadyInProgress: [],
      reposExcludedForCircuitOpen: [],
    });
  });

  test("a batch spanning a free repo and an already-busy one reports each repo's own outcome, not one shared verdict", async () => {
    viewPrsSchedulerState.autoRefreshInProgressRepos = new Set(["owner/repo-busy"]);

    const result = await runViewPrsAutoRefresh({
      reposOverride: ["owner/repo-one", "owner/repo-busy"],
    });

    // The busy repo never actually ran - it must show up as excluded, not
    // silently absorbed into the other repo's success.
    expect(result.succeededRepos).toEqual(["owner/repo-one"]);
    expect(result.reposExcludedForAlreadyInProgress).toEqual(["owner/repo-busy"]);
    expect(result.failedRepos).toEqual([]);
  });

  test("a concurrent auto refresh attempt emits only a skipped event, no start", async () => {
    viewPrsSchedulerState.isAutoRunInProgress = true;
    // Populate autoRefreshInProgressRepos with the exact repo this call
    // targets for a genuine full-overlap collision (auto refresh is now
    // per-repo-aware).
    viewPrsSchedulerState.autoRefreshInProgressRepos = new Set(["owner/repo-one"]);

    const result = await runViewPrsAutoRefresh({ reposOverride: ["owner/repo-one"] });

    expect(result).toEqual({ skipped: true, skipReason: "already-in-progress" });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      job: "autoRefresh",
      phase: "skipped",
      detail: { reason: "already-in-progress" },
    });
  });

  test("a circuit-open auto refresh attempt emits skipped with no start", async () => {
    // Populate the exact repo this call targets (circuit breaker is now
    // per-repo - see autoCircuitByRepo's own comment in app.js).
    viewPrsSchedulerState.autoCircuitByRepo["owner/repo-one"] = {
      consecutiveFailures: 3,
      circuitOpenUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      lastCircuitOpenedAt: new Date().toISOString(),
    };

    const result = await runViewPrsAutoRefresh({ reposOverride: ["owner/repo-one"] });

    expect(result).toEqual({ skipped: true, skipReason: "circuit-open" });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ job: "autoRefresh", phase: "skipped" });
    expect(captured[0].detail.reason).toBe("circuit-open");
  });

  test("a manual-cooldown auto refresh attempt emits skipped with no start", async () => {
    viewPrsSchedulerState.lastManualRunAt = new Date(
      Date.now() - 5 * 60 * 1000,
    ).toISOString();

    const result = await runViewPrsAutoRefresh({ reposOverride: ["owner/repo-one"] });

    expect(result).toEqual({ skipped: true, skipReason: "manual-cooldown" });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      job: "autoRefresh",
      phase: "skipped",
      detail: { reason: "manual-cooldown" },
    });
  });

  test("quick check started while auto refresh is running emits deferred with willRunAfter:true", async () => {
    viewPrsSchedulerState.isAutoRunInProgress = true;
    // Quick check with no args targets every configured repo - populate
    // autoRefreshInProgressRepos with that same set for a genuine
    // full-overlap collision (quick check is now per-repo-aware).
    viewPrsSchedulerState.autoRefreshInProgressRepos = new Set(
      appModule.getViewPrsAutoRefreshRepos(),
    );

    const result = await runViewPrsQuickCheck();

    expect(result.skipped).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      job: "quickCheck",
      phase: "deferred",
      detail: { waitingOn: "autoRefresh", willRunAfter: true },
    });
  });

  test("quick check started while another quick check is running emits skipped with willRunAfter:false", async () => {
    viewPrsSchedulerState.isQuickCheckInProgress = true;
    // No-arg quick check targets every configured repo - populate
    // quickCheckInProgressRepos with that same set for a genuine
    // full-overlap collision (quick check is now per-repo-aware).
    viewPrsSchedulerState.quickCheckInProgressRepos = new Set(
      appModule.getViewPrsAutoRefreshRepos(),
    );

    const result = await runViewPrsQuickCheck();

    expect(result.skipped).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      job: "quickCheck",
      phase: "skipped",
      detail: { reason: "already-in-progress", willRunAfter: false },
    });
  });

  test("a clean quick check emits start then finish with ok:true", async () => {
    await runViewPrsQuickCheck();

    const phases = captured.map((event) => `${event.job}:${event.phase}`);
    expect(phases).toEqual(["quickCheck:start", "quickCheck:finish"]);
    expect(captured[1].ok).toBe(true);
  });

  test("a merged-queue drain with nothing pending emits only skipped", async () => {
    const result = await runViewPrsMergedQueueDrain();

    // "nothing-pending" is a genuine "checked, found nothing to do" outcome,
    // not a blocked/prevented skip - deliberately NOT { skipped: true },
    // so the dispatcher still waits the normal full interval, not a short
    // retry (see runViewPrsMergedQueueDrain's own comment on this path).
    expect(result).toBeUndefined();
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      job: "mergedQueueDrain",
      phase: "skipped",
      detail: { reason: "nothing-pending" },
    });
  });

  test("a merged-queue drain whose target repos are blocked (e.g. circuit-open) propagates the inner skip signal", async () => {
    viewPrsSchedulerState.pendingByRepo = {
      "owner/repo-drain": { open: [], mergedClosed: ["42"] },
    };
    viewPrsSchedulerState.autoCircuitByRepo["owner/repo-drain"] = {
      consecutiveFailures: 3,
      circuitOpenUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      lastCircuitOpenedAt: new Date().toISOString(),
    };

    const result = await runViewPrsMergedQueueDrain();

    expect(result).toEqual({ skipped: true, skipReason: "circuit-open" });
    // The outer mergedQueueDrain job must itself report "skipped", not
    // "finish" - a finish event here (previously emitted unconditionally)
    // would misleadingly read as a completed drain even though nothing was
    // actually drained.
    const phases = captured.map((event) => `${event.job}:${event.phase}`);
    expect(phases).toEqual(["mergedQueueDrain:start", "autoRefresh:skipped", "mergedQueueDrain:skipped"]);
    expect(captured[2].detail).toMatchObject({ reason: "circuit-open" });
  });

  test("a merged-queue drain with pending repos emits a nested start/finish sequence around autoRefresh's own", async () => {
    viewPrsSchedulerState.pendingByRepo = {
      "owner/repo-drain": { open: [], mergedClosed: ["42"] },
    };

    await runViewPrsMergedQueueDrain();

    const phases = captured.map((event) => `${event.job}:${event.phase}`);
    expect(phases).toEqual([
      "mergedQueueDrain:start",
      "autoRefresh:start",
      "autoRefresh:finish",
      "mergedQueueDrain:finish",
    ]);
  });
});
