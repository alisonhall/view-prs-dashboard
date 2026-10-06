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
    await runViewPrsAutoRefresh({ reposOverride: ["owner/repo-one"] });

    const phases = captured.map((event) => `${event.job}:${event.phase}`);
    expect(phases).toEqual(["autoRefresh:start", "autoRefresh:finish"]);
    expect(captured[1].ok).toBe(true);
  });

  test("a concurrent auto refresh attempt emits only a skipped event, no start", async () => {
    viewPrsSchedulerState.isAutoRunInProgress = true;

    await runViewPrsAutoRefresh({ reposOverride: ["owner/repo-one"] });

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      job: "autoRefresh",
      phase: "skipped",
      detail: { reason: "already-in-progress" },
    });
  });

  test("a circuit-open auto refresh attempt emits skipped with no start", async () => {
    viewPrsSchedulerState.autoCircuitOpenUntil = new Date(
      Date.now() + 60 * 60 * 1000,
    ).toISOString();
    viewPrsSchedulerState.consecutiveAutoFailures = 3;

    await runViewPrsAutoRefresh({ reposOverride: ["owner/repo-one"] });

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ job: "autoRefresh", phase: "skipped" });
    expect(captured[0].detail.reason).toBe("circuit-open");
  });

  test("a manual-cooldown auto refresh attempt emits skipped with no start", async () => {
    viewPrsSchedulerState.lastManualRunAt = new Date(
      Date.now() - 5 * 60 * 1000,
    ).toISOString();

    await runViewPrsAutoRefresh({ reposOverride: ["owner/repo-one"] });

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      job: "autoRefresh",
      phase: "skipped",
      detail: { reason: "manual-cooldown" },
    });
  });

  test("quick check started while auto refresh is running emits deferred with willRunAfter:true", async () => {
    viewPrsSchedulerState.isAutoRunInProgress = true;

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
    await runViewPrsMergedQueueDrain();

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      job: "mergedQueueDrain",
      phase: "skipped",
      detail: { reason: "nothing-pending" },
    });
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
