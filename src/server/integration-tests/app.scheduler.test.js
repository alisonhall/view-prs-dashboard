const appModule = require("../app.js");
const {
  parseTimestamp,
  getManualCooldownSkipReason,
  getViewPrsAutoRefreshRepos,
  getViewPrsAutoCircuitOpenState,
  buildAckRefreshBudgetSkipErrors,
  runViewPrsAutoRefresh,
  runViewPrsQuickCheck,
  runViewPrsMergedQueueDrain,
  resetViewPrsAutoRefreshFailureState,
  initializeScheduler,
  viewPrsSchedulerState,
} = appModule;

const resetSchedulerState = () => {
  viewPrsSchedulerState.isAutoRunInProgress = false;
  viewPrsSchedulerState.activePrNumbers = [];
  viewPrsSchedulerState.lastAutoAttemptAt = null;
  viewPrsSchedulerState.lastAutoSkipReason = null;
  viewPrsSchedulerState.lastAutoError = null;
  viewPrsSchedulerState.lastAutoRunAt = null;
  viewPrsSchedulerState.lastManualRunAt = null;
  viewPrsSchedulerState.isQuickCheckInProgress = false;
  viewPrsSchedulerState.lastQuickCheckAttemptAt = null;
  viewPrsSchedulerState.lastQuickCheckSkipReason = null;
  viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress = false;
  resetViewPrsAutoRefreshFailureState();
};

describe("scheduler helper behavior", () => {
  describe("parseTimestamp", () => {
    test.each([
      ["valid ISO timestamp", "2026-03-11T10:00:00Z", true],
      ["invalid timestamp text", "not-a-date", false],
    ])("returns expected parse state for %s", (_label, input, shouldBeFinite) => {
      const parsed = parseTimestamp(input);
      if (shouldBeFinite) {
        expect(Number.isFinite(parsed)).toBe(true);
      } else {
        expect(parsed).toBeNull();
      }
    });
  });

  describe("getManualCooldownSkipReason", () => {
    const cooldownMs = 15 * 60 * 1000;
    const nowMs = Date.parse("2026-03-11T10:15:00Z");

    test("returns a skip reason when the run is inside the cooldown window", () => {
      const result = getManualCooldownSkipReason({
        nowMs,
        lastManualRunAt: "2026-03-11T10:05:01Z",
        manualCooldownMs: cooldownMs,
      });

      expect(result).toBe("manual run happened within the last 15 minutes");
    });

    test.each([
      ["the exact cooldown boundary", "2026-03-11T10:00:00Z"],
      ["a missing timestamp", ""],
    ])("returns null for %s", (_label, lastManualRunAt) => {
      const result = getManualCooldownSkipReason({
        nowMs,
        lastManualRunAt,
        manualCooldownMs: cooldownMs,
      });

      expect(result).toBeNull();
    });
  });

  describe("getViewPrsAutoRefreshRepos", () => {
    test("includes configured repos, stored repos, and last-run repo without duplicates, and does not add the hardcoded default repo when real repos are already known", () => {
      const result = getViewPrsAutoRefreshRepos(
        {
          byPrNumber: {
            1: { repo: "owner/one" },
            2: { repo: "owner/two" },
            3: { repo: "owner/one" },
          },
          lastRun: { repo: "owner/three" },
        },
        "owner/four, invalid, owner/two",
      );

      expect(result).toEqual(["owner/four", "owner/two", "owner/one", "owner/three"]);
      expect(result).not.toContain("optum-rx-clinicalproducts/orx-cpp-mp-uis");
    });

    test("given placeholder owner/repo values, when building auto-refresh repos, then excludes placeholder entries and does not add the hardcoded default repo since a real repo is still known", () => {
      const result = getViewPrsAutoRefreshRepos(
        {
          byPrNumber: {
            1: { repo: "owner/repo" },
            2: { repo: "owner/real-repo" },
          },
          lastRun: { repo: "owner/repo" },
        },
        "owner/repo, owner/extra-repo",
      );

      expect(result).toEqual(["owner/extra-repo", "owner/real-repo"]);
    });

    // defaultViewPrsRepo (app-config.js) no longer has a hardcoded fallback
    // - it's whatever VIEW_PRS_REPO resolves to (a fake placeholder here,
    // via jest.setup.env.js; undefined/empty on a real machine that hasn't
    // set it, in which case this correctly returns [] instead of
    // bootstrapping against some other user's repo - see
    // app-config.test.js's own "no fallback" test for that case).
    test("given no configured repos, no stored data, and no last-run repo, when building auto-refresh repos, then falls back to VIEW_PRS_REPO so a fresh install can still bootstrap", () => {
      const result = getViewPrsAutoRefreshRepos({ byPrNumber: {}, lastRun: null }, "");

      expect(result).toEqual(["test-org/test-repo"]);
    });
  });

  describe("getViewPrsAutoCircuitOpenState", () => {
    test("reports closed when now is after the open-until boundary", () => {
      const result = getViewPrsAutoCircuitOpenState({
        nowMs: Date.parse("2026-03-11T10:15:00Z"),
        autoCircuitOpenUntil: "2026-03-11T10:14:59Z",
      });

      expect(result).toEqual({
        isOpen: false,
        openUntilIso: null,
      });
    });

    test("reports open while now is before open-until", () => {
      const result = getViewPrsAutoCircuitOpenState({
        nowMs: Date.parse("2026-03-11T10:14:00Z"),
        autoCircuitOpenUntil: "2026-03-11T10:20:00Z",
      });

      expect(result).toEqual({
        isOpen: true,
        openUntilIso: "2026-03-11T10:20:00.000Z",
      });
    });

    test("treats malformed open-until timestamps as closed", () => {
      const result = getViewPrsAutoCircuitOpenState({
        nowMs: Date.parse("2026-03-11T10:14:00Z"),
        autoCircuitOpenUntil: "not-a-timestamp",
      });

      expect(result).toEqual({
        isOpen: false,
        openUntilIso: null,
      });
    });
  });

  describe("buildAckRefreshBudgetSkipErrors", () => {
    test("generates skip errors for refresh entries beyond the processed index", () => {
      const result = buildAckRefreshBudgetSkipErrors({
        refreshList: ["101", "102", "103"],
        startIndex: 1,
        totalRefreshBudgetMs: 480000,
      });

      expect(result).toEqual([
        {
          prNumber: "102",
          error: "Skipped: total ack refresh budget exceeded after 480s",
        },
        {
          prNumber: "103",
          error: "Skipped: total ack refresh budget exceeded after 480s",
        },
      ]);
    });

    test("returns an empty list when there are no remaining PRs to skip", () => {
      const result = buildAckRefreshBudgetSkipErrors({
        refreshList: ["101"],
        startIndex: 5,
        totalRefreshBudgetMs: 480000,
      });

      expect(result).toEqual([]);
    });
  });
});

describe("resetViewPrsAutoRefreshFailureState behavior", () => {
  beforeEach(() => {
    viewPrsSchedulerState.consecutiveAutoFailures = 5;
    viewPrsSchedulerState.autoCircuitOpenUntil = new Date(
      Date.now() + 60 * 60 * 1000,
    ).toISOString();
  });

  test("sets autoCircuitOpenUntil to null when resetViewPrsAutoRefreshFailureState is called", () => {
    resetViewPrsAutoRefreshFailureState();
    expect(viewPrsSchedulerState.autoCircuitOpenUntil).toBeNull();
  });

  test("sets consecutiveAutoFailures to zero when resetViewPrsAutoRefreshFailureState is called", () => {
    resetViewPrsAutoRefreshFailureState();
    expect(viewPrsSchedulerState.consecutiveAutoFailures).toBe(0);
  });
});

describe("runViewPrsAutoRefresh behavior", () => {
  const savedDependencyStatus = appModule.getDependencyStatus;
  const savedRunViewPrsScript = appModule.runViewPrsScript;
  const savedReadViewPrsData = appModule.readViewPrsData;

  beforeAll(() => {
    appModule.getDependencyStatus = () => ({ ok: true, missing: [] });
    appModule.runViewPrsScript = async () => ({ stdout: "", stderr: "" });
    // "owner/repo" is deliberately NOT used here even though it reads like
    // an obvious placeholder: getViewPrsAutoRefreshRepos (view-prs-
    // scheduler-helpers.js) treats "owner/repo" as a real sentinel for "no
    // repo configured yet" and filters it out on purpose. Using it as this
    // fixture's repo silently made every entry below get ignored, so
    // getViewPrsAutoRefreshRepos() fell through to defaultViewPrsRepo (the
    // test env's VIEW_PRS_REPO) instead of this fixture's data - every test
    // in this block still passed (none of the others assert which repo was
    // actually used), but "seeds only the latest merged PRs before auto
    // refresh starts" below silently tested the wrong repo's (empty) seed
    // list the whole time, inside a callback whose thrown expect() failure
    // gets caught by runViewPrsAutoRefresh's own try/catch and logged as an
    // "auto refresh had failures" console.error rather than failing the
    // test. A real, non-placeholder repo name here is what actually
    // exercises the fixture data.
    appModule.readViewPrsData = () => ({
      byPrNumber: {
        1: { repo: "acme-org/acme-repo", section: "merged", prNumber: "1", data: { mergedAt: "2026-05-29T10:00:00Z" } },
        2: { repo: "acme-org/acme-repo", section: "open", prNumber: "2", data: { mergedAt: "" } },
        3: { repo: "acme-org/acme-repo", section: "merged", prNumber: "3", data: { mergedAt: "2026-05-29T11:00:00Z" } },
        4: { repo: "acme-org/acme-repo", section: "draft", prNumber: "4", data: { mergedAt: "" } },
      },
    });
  });

  afterAll(() => {
    if (savedDependencyStatus !== undefined) {
      appModule.getDependencyStatus = savedDependencyStatus;
    } else {
      delete appModule.getDependencyStatus;
    }
    if (savedRunViewPrsScript !== undefined) {
      appModule.runViewPrsScript = savedRunViewPrsScript;
    } else {
      delete appModule.runViewPrsScript;
    }
    if (savedReadViewPrsData !== undefined) {
      appModule.readViewPrsData = savedReadViewPrsData;
    } else {
      delete appModule.readViewPrsData;
    }
  });

  beforeEach(() => {
    resetSchedulerState();
  });

  test("sets a circuit-open skip reason when runViewPrsAutoRefresh is called while the circuit is open", async () => {
    viewPrsSchedulerState.autoCircuitOpenUntil = new Date(
      Date.now() + 60 * 60 * 1000,
    ).toISOString();
    viewPrsSchedulerState.consecutiveAutoFailures = 3;

    await runViewPrsAutoRefresh();

    expect(viewPrsSchedulerState.lastAutoSkipReason).toMatch(/circuit open/i);
    expect(viewPrsSchedulerState.isAutoRunInProgress).toBe(false);
    expect(viewPrsSchedulerState.lastAutoRunAt).toBeNull();
  });

  test("sets a manual-cooldown skip reason when runViewPrsAutoRefresh is called inside cooldown", async () => {
    viewPrsSchedulerState.lastManualRunAt = new Date(
      Date.now() - 5 * 60 * 1000,
    ).toISOString();

    await runViewPrsAutoRefresh();

    expect(viewPrsSchedulerState.lastAutoSkipReason).toMatch(/manual run/i);
    expect(viewPrsSchedulerState.isAutoRunInProgress).toBe(false);
    expect(viewPrsSchedulerState.lastAutoRunAt).toBeNull();
  });

  test("bypasses the circuit breaker when runViewPrsAutoRefresh receives skipCooldownChecks=true", async () => {
    viewPrsSchedulerState.autoCircuitOpenUntil = new Date(
      Date.now() + 60 * 60 * 1000,
    ).toISOString();
    viewPrsSchedulerState.consecutiveAutoFailures = 3;

    await runViewPrsAutoRefresh({ skipCooldownChecks: true });

    expect(viewPrsSchedulerState.lastAutoSkipReason).toBeNull();
    expect(viewPrsSchedulerState.lastAutoAttemptAt).toBeTruthy();
    expect(viewPrsSchedulerState.isAutoRunInProgress).toBe(false);
  });

  test("bypasses manual cooldown when runViewPrsAutoRefresh receives skipCooldownChecks=true", async () => {
    viewPrsSchedulerState.lastManualRunAt = new Date(
      Date.now() - 5 * 60 * 1000,
    ).toISOString();

    await runViewPrsAutoRefresh({ skipCooldownChecks: true });

    expect(viewPrsSchedulerState.lastAutoSkipReason).toBeNull();
    expect(viewPrsSchedulerState.lastAutoAttemptAt).toBeTruthy();
    expect(viewPrsSchedulerState.isAutoRunInProgress).toBe(false);
  });

  test("does not start a second run when runViewPrsAutoRefresh is called during an active run", async () => {
    viewPrsSchedulerState.isAutoRunInProgress = true;

    await runViewPrsAutoRefresh({ skipCooldownChecks: true });

    // lastAutoAttemptAt should remain unset since we returned early
    expect(viewPrsSchedulerState.lastAutoAttemptAt).toBeNull();
    // isAutoRunInProgress should still be true — we didn't touch it
    expect(viewPrsSchedulerState.isAutoRunInProgress).toBe(true);

    // Clean up for subsequent tests
    viewPrsSchedulerState.isAutoRunInProgress = false;
  });

  test("clears isAutoRunInProgress when runViewPrsAutoRefresh finishes successfully", async () => {
    await runViewPrsAutoRefresh({ skipCooldownChecks: true });

    expect(viewPrsSchedulerState.isAutoRunInProgress).toBe(false);
  });

  test("fires an immediate catch-up quick check when a quick check was starved by this run", async () => {
    // Regression test: a quick check skipped specifically because this run
    // was in progress should be retried the moment this run finishes,
    // rather than silently waiting for the next periodic quick-check tick -
    // see quickCheckSkippedWhileAutoRunInProgress's own comment near
    // viewPrsSchedulerState's definition for why that matters (a slow
    // multi-repo full sweep could otherwise leave something newly changed,
    // like a brand-new PR, undetected far longer than the quick-check's own
    // ~5 minute interval would suggest).
    viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress = true;
    let quickCheckRunCount = 0;
    appModule.runViewPrsQuickCheck = async () => {
      quickCheckRunCount += 1;
      return { skipped: false, reposChecked: [], reposFailed: [] };
    };

    try {
      await runViewPrsAutoRefresh({ skipCooldownChecks: true });
      // The catch-up is fire-and-forget (void runViewPrsQuickCheck()) -
      // give its microtask a turn to run before asserting.
      await new Promise((resolve) => setImmediate(resolve));

      expect(quickCheckRunCount).toBe(1);
      expect(viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress).toBe(false);
    } finally {
      delete appModule.runViewPrsQuickCheck;
    }
  });

  test("does not fire a catch-up quick check when nothing was starved by this run", async () => {
    viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress = false;
    let quickCheckRunCount = 0;
    appModule.runViewPrsQuickCheck = async () => {
      quickCheckRunCount += 1;
      return { skipped: false, reposChecked: [], reposFailed: [] };
    };

    try {
      await runViewPrsAutoRefresh({ skipCooldownChecks: true });
      await new Promise((resolve) => setImmediate(resolve));

      expect(quickCheckRunCount).toBe(0);
    } finally {
      delete appModule.runViewPrsQuickCheck;
    }
  });

  test("sets lastAutoRunAt when runViewPrsAutoRefresh finishes successfully", async () => {
    const beforeRun = Date.now();

    await runViewPrsAutoRefresh({ skipCooldownChecks: true });

    expect(viewPrsSchedulerState.lastAutoRunAt).toBeTruthy();
    expect(
      Date.parse(viewPrsSchedulerState.lastAutoRunAt),
    ).toBeGreaterThanOrEqual(beforeRun);
  });

  test("seeds only the latest merged PRs before auto refresh starts", async () => {
    let observedActivePrNumbers = null;
    appModule.runViewPrsScript = async () => {
      // Captured rather than asserted inline: a thrown expect() here would
      // be swallowed by runViewPrsAutoRefresh's own try/catch (it becomes a
      // logged "auto refresh had failures" instead of a failed test) - see
      // the beforeAll fixture's own comment for how that previously masked
      // this exact test not actually checking anything.
      observedActivePrNumbers = viewPrsSchedulerState.activePrNumbers;
      return { stdout: "", stderr: "" };
    };

    await runViewPrsAutoRefresh({ skipCooldownChecks: true });

    expect(observedActivePrNumbers).toEqual([
      { repo: "acme-org/acme-repo", prNumber: "1" },
      { repo: "acme-org/acme-repo", prNumber: "3" },
    ]);
    expect(viewPrsSchedulerState.activePrNumbers).toEqual([]);
    expect(viewPrsSchedulerState.isAutoRunInProgress).toBe(false);
  });

  test("on startup, initializeScheduler runs the quick check (and its pending-repo priority refresh) before the full every-repo update", async () => {
    // initializeScheduler only returns its LAST setInterval (the full
    // auto-refresh one); it also starts two more (quick check, merged
    // drain) that would otherwise leak as real, minutes-long timers.
    // Capture every interval it creates so all three get cleared, not just
    // the one it hands back.
    const realSetInterval = global.setInterval;
    const createdIntervals = [];
    const setIntervalSpy = jest
      .spyOn(global, "setInterval")
      .mockImplementation((...args) => {
        const realId = realSetInterval(...args);
        createdIntervals.push(realId);
        return realId;
      });

    const calls = [];
    appModule.runViewPrsScript = async (commandArgs) => {
      const isQuickCheck = commandArgs.includes("--quick-check");
      calls.push(isQuickCheck ? "quick-check" : "full-refresh");
      if (isQuickCheck) {
        // Reports a pending open change so the quick check's own
        // fast-follow targeted refresh fires too - that should also
        // complete (a second "full-refresh" entry) before
        // initializeScheduler's own full update runs.
        return {
          stdout: JSON.stringify({ pendingOpen: ["1"], pendingMergedClosed: [] }),
          stderr: "",
        };
      }
      return { stdout: "", stderr: "" };
    };

    try {
      initializeScheduler();

      // Everything above is mocked to resolve near-instantly; this just
      // gives the unawaited startup chain (quick check -> its targeted
      // fast-follow -> the full update) room to actually run.
      await new Promise((resolve) => setTimeout(resolve, 200));

      // The first call must be the quick check, and it must be followed by
      // at least one full-refresh call (the fast-follow, then
      // initializeScheduler's own full update) - never a full-refresh
      // before any quick check has run at all.
      expect(calls[0]).toBe("quick-check");
      expect(calls.filter((call) => call === "full-refresh").length).toBeGreaterThanOrEqual(1);
    } finally {
      createdIntervals.forEach((id) => clearInterval(id));
      setIntervalSpy.mockRestore();
    }
  });

  test("on startup, initializeScheduler routes both of its own calls through the overridable module.exports functions, not raw closures", async () => {
    // Regression test: these two call sites previously referenced the raw
    // runViewPrsQuickCheck/runViewPrsAutoRefresh closures directly, so
    // monkeypatching module.exports.X (the pattern every other overridable
    // dependency in this file uses) silently had no effect on them.
    const realSetInterval = global.setInterval;
    const createdIntervals = [];
    const setIntervalSpy = jest
      .spyOn(global, "setInterval")
      .mockImplementation((...args) => {
        const realId = realSetInterval(...args);
        createdIntervals.push(realId);
        return realId;
      });

    const originalRunViewPrsQuickCheck = appModule.runViewPrsQuickCheck;
    const originalRunViewPrsAutoRefresh = appModule.runViewPrsAutoRefresh;
    let quickCheckCalled = false;
    let autoRefreshArgs = null;
    appModule.runViewPrsQuickCheck = async () => {
      quickCheckCalled = true;
      return { reposWithPendingOpen: [] };
    };
    appModule.runViewPrsAutoRefresh = async (args) => {
      autoRefreshArgs = args;
    };

    const savedAutoRepos = process.env.VIEW_PRS_AUTO_REPOS;
    process.env.VIEW_PRS_AUTO_REPOS = "acme-org/acme-repo";

    try {
      initializeScheduler();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(quickCheckCalled).toBe(true);
      expect(autoRefreshArgs).toEqual({ reposOverride: ["acme-org/acme-repo"] });
    } finally {
      createdIntervals.forEach((id) => clearInterval(id));
      setIntervalSpy.mockRestore();
      appModule.runViewPrsQuickCheck = originalRunViewPrsQuickCheck;
      appModule.runViewPrsAutoRefresh = originalRunViewPrsAutoRefresh;
      if (savedAutoRepos === undefined) {
        delete process.env.VIEW_PRS_AUTO_REPOS;
      } else {
        process.env.VIEW_PRS_AUTO_REPOS = savedAutoRepos;
      }
    }
  });

  test("initializeScheduler's periodic setInterval ticks route through the overridable module.exports functions too, not raw closures", async () => {
    // Regression test: the three setInterval(...) registrations previously
    // passed the raw runViewPrsQuickCheck/runViewPrsMergedQueueDrain/
    // runViewPrsAutoRefresh closures directly, so - unlike every other
    // call site fixed alongside this one - even a monkeypatch applied
    // *before* initializeScheduler() runs would never reach a periodic
    // tick, since the bare reference is captured once, permanently, when
    // setInterval() is called. Verified here by invoking each captured
    // callback directly rather than waiting on the real, minutes-long
    // interval durations.
    const realSetInterval = global.setInterval;
    const createdIntervals = [];
    const registeredCallbacks = [];
    const setIntervalSpy = jest
      .spyOn(global, "setInterval")
      .mockImplementation((callback, ms, ...rest) => {
        registeredCallbacks.push(callback);
        const realId = realSetInterval(() => {}, ms, ...rest);
        createdIntervals.push(realId);
        return realId;
      });

    const originalRunViewPrsQuickCheck = appModule.runViewPrsQuickCheck;
    const originalRunViewPrsMergedQueueDrain = appModule.runViewPrsMergedQueueDrain;
    const originalRunViewPrsAutoRefresh = appModule.runViewPrsAutoRefresh;
    let quickCheckTickCount = 0;
    let mergedDrainTickCount = 0;
    let autoRefreshTickCount = 0;
    appModule.runViewPrsQuickCheck = async () => {
      quickCheckTickCount += 1;
      return { reposWithPendingOpen: [] };
    };
    appModule.runViewPrsMergedQueueDrain = async () => {
      mergedDrainTickCount += 1;
    };
    appModule.runViewPrsAutoRefresh = async () => {
      autoRefreshTickCount += 1;
    };

    try {
      initializeScheduler();
      // initializeScheduler's own unawaited startup chain also calls
      // runViewPrsQuickCheck/runViewPrsAutoRefresh once each - let that
      // settle first so only the *periodic* ticks below are counted.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const quickCheckTicksFromStartup = quickCheckTickCount;
      const autoRefreshTicksFromStartup = autoRefreshTickCount;

      expect(registeredCallbacks).toHaveLength(3);
      await Promise.all(registeredCallbacks.map((callback) => callback()));

      expect(quickCheckTickCount).toBe(quickCheckTicksFromStartup + 1);
      expect(mergedDrainTickCount).toBe(1);
      expect(autoRefreshTickCount).toBe(autoRefreshTicksFromStartup + 1);
    } finally {
      createdIntervals.forEach((id) => clearInterval(id));
      setIntervalSpy.mockRestore();
      appModule.runViewPrsQuickCheck = originalRunViewPrsQuickCheck;
      appModule.runViewPrsMergedQueueDrain = originalRunViewPrsMergedQueueDrain;
      appModule.runViewPrsAutoRefresh = originalRunViewPrsAutoRefresh;
    }
  });

  test("on startup, initializeScheduler does not re-refresh a repo the quick check's targeted pass already covered", async () => {
    const realSetInterval = global.setInterval;
    const createdIntervals = [];
    const setIntervalSpy = jest
      .spyOn(global, "setInterval")
      .mockImplementation((...args) => {
        const realId = realSetInterval(...args);
        createdIntervals.push(realId);
        return realId;
      });

    const fullRefreshRepos = [];
    appModule.runViewPrsScript = async (commandArgs) => {
      const repoIndex = commandArgs.indexOf("--repo");
      const repo = repoIndex !== -1 ? commandArgs[repoIndex + 1] : null;
      if (commandArgs.includes("--quick-check")) {
        // Only the fixture's own repo reports a pending open change - the
        // second repo (added via VIEW_PRS_AUTO_REPOS below) reports
        // nothing pending, so it's untouched by the targeted pass and
        // should only be refreshed once, by initializeScheduler's own
        // follow-up.
        const pendingOpen = repo === "acme-org/acme-repo" ? ["1"] : [];
        return {
          stdout: JSON.stringify({ pendingOpen, pendingMergedClosed: [] }),
          stderr: "",
        };
      }
      fullRefreshRepos.push(repo);
      return { stdout: "", stderr: "" };
    };

    const savedAutoRepos = process.env.VIEW_PRS_AUTO_REPOS;
    process.env.VIEW_PRS_AUTO_REPOS = "acme-org/other-repo";

    try {
      initializeScheduler();
      // Everything above resolves near-instantly; this gives the
      // unawaited startup chain room to actually run.
      await new Promise((resolve) => setTimeout(resolve, 200));

      // "acme-org/acme-repo" gets exactly one real full-refresh script
      // call (from the quick check's own targeted pass) - not a second
      // one from initializeScheduler's own follow-up full update, which
      // should only cover "acme-org/other-repo" (never touched by the
      // targeted pass, since it had nothing pending).
      expect(
        fullRefreshRepos.filter((repo) => repo === "acme-org/acme-repo").length,
      ).toBe(1);
      expect(fullRefreshRepos).toContain("acme-org/other-repo");
    } finally {
      createdIntervals.forEach((id) => clearInterval(id));
      setIntervalSpy.mockRestore();
      if (savedAutoRepos === undefined) {
        delete process.env.VIEW_PRS_AUTO_REPOS;
      } else {
        process.env.VIEW_PRS_AUTO_REPOS = savedAutoRepos;
      }
    }
  });

  test("uses bounded repo concurrency during auto refresh when configured", async () => {
    const savedAutoRepos = process.env.VIEW_PRS_AUTO_REPOS;
    const savedAutoRepoConcurrency = process.env.VIEW_PRS_AUTO_REPO_CONCURRENCY;
    process.env.VIEW_PRS_AUTO_REPOS = "owner/repo-one,owner/repo-two";
    process.env.VIEW_PRS_AUTO_REPO_CONCURRENCY = "2";

    const observedRepos = [];
    let inFlightRuns = 0;
    let maxInFlightRuns = 0;

    appModule.runViewPrsScript = async (commandArgs) => {
      const repoFlagIndex = commandArgs.findIndex((arg) => arg === "--repo");
      const repo =
        repoFlagIndex >= 0 ? String(commandArgs[repoFlagIndex + 1] || "") : "";
      observedRepos.push(repo);

      inFlightRuns += 1;
      maxInFlightRuns = Math.max(maxInFlightRuns, inFlightRuns);
      await new Promise((resolve) => setTimeout(resolve, 25));
      inFlightRuns -= 1;

      return { stdout: "", stderr: "" };
    };

    try {
      await runViewPrsAutoRefresh({ skipCooldownChecks: true });
    } finally {
      if (savedAutoRepos === undefined) {
        delete process.env.VIEW_PRS_AUTO_REPOS;
      } else {
        process.env.VIEW_PRS_AUTO_REPOS = savedAutoRepos;
      }
      if (savedAutoRepoConcurrency === undefined) {
        delete process.env.VIEW_PRS_AUTO_REPO_CONCURRENCY;
      } else {
        process.env.VIEW_PRS_AUTO_REPO_CONCURRENCY = savedAutoRepoConcurrency;
      }
    }

    expect(observedRepos).toEqual(
      expect.arrayContaining(["owner/repo-one", "owner/repo-two"]),
    );
    expect(maxInFlightRuns).toBeGreaterThan(1);
  });

  test("records per-repo timing metrics and first-progress timing in action log", async () => {
    const savedAutoRepos = process.env.VIEW_PRS_AUTO_REPOS;
    process.env.VIEW_PRS_AUTO_REPOS = "owner/repo-metrics";

    appModule.runViewPrsScript = async (_commandArgs, _maxBuffer, options) => {
      options?.progressTracker?.onStart?.("3");
      options?.progressTracker?.onEnd?.("3");
      options?.progressTracker?.onRunDone?.(new Map([["3", 1]]));
      return { stdout: "", stderr: "" };
    };

    await runViewPrsAutoRefresh({ skipCooldownChecks: true });

    if (savedAutoRepos === undefined) {
      delete process.env.VIEW_PRS_AUTO_REPOS;
    } else {
      process.env.VIEW_PRS_AUTO_REPOS = savedAutoRepos;
    }

    const latestEntry = appModule.readActionLog()[0] || {};
    expect(latestEntry.action).toBe("auto-refresh");
    expect(latestEntry.detail).toEqual(
      expect.objectContaining({
        repoConcurrency: expect.any(Number),
        repoMetrics: expect.any(Array),
        firstPrProgressAt: expect.any(String),
        timeToFirstPrProgressMs: expect.any(Number),
      }),
    );
    expect(Array.isArray(latestEntry.detail.repoMetrics)).toBe(true);
    expect(latestEntry.detail.repoMetrics.length).toBeGreaterThan(0);
    expect(latestEntry.detail.repoMetrics[0]).toEqual(
      expect.objectContaining({
        repo: expect.any(String),
        durationMs: expect.any(Number),
        queueWaitMs: expect.any(Number),
        seededPrCount: expect.any(Number),
        timeToFirstPrProgressMs: expect.any(Number),
      }),
    );
  });
});

describe("runViewPrsQuickCheck behavior", () => {
  const savedDependencyStatus = appModule.getDependencyStatus;
  const savedRunViewPrsScript = appModule.runViewPrsScript;

  const resetQuickCheckState = () => {
    viewPrsSchedulerState.isQuickCheckInProgress = false;
    viewPrsSchedulerState.isAutoRunInProgress = false;
    viewPrsSchedulerState.lastQuickCheckAt = null;
    viewPrsSchedulerState.lastQuickCheckAttemptAt = null;
    viewPrsSchedulerState.lastQuickCheckSkipReason = null;
    viewPrsSchedulerState.lastQuickCheckError = null;
    viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress = false;
    viewPrsSchedulerState.pendingByRepo = {};
    viewPrsSchedulerState.autoCircuitOpenUntil = null;
    viewPrsSchedulerState.consecutiveAutoFailures = 0;
    appModule.getDependencyStatus = () => ({ ok: true, missing: [] });
  };

  beforeEach(() => {
    resetQuickCheckState();
  });

  afterAll(() => {
    if (savedDependencyStatus !== undefined) {
      appModule.getDependencyStatus = savedDependencyStatus;
    } else {
      delete appModule.getDependencyStatus;
    }
    if (savedRunViewPrsScript !== undefined) {
      appModule.runViewPrsScript = savedRunViewPrsScript;
    } else {
      delete appModule.runViewPrsScript;
    }
  });

  const withAutoRepos = async (reposCsv, fn) => {
    const saved = process.env.VIEW_PRS_AUTO_REPOS;
    process.env.VIEW_PRS_AUTO_REPOS = reposCsv;
    try {
      await fn();
    } finally {
      if (saved === undefined) {
        delete process.env.VIEW_PRS_AUTO_REPOS;
      } else {
        process.env.VIEW_PRS_AUTO_REPOS = saved;
      }
    }
  };

  test("does nothing when a quick check is already in progress, but records the skip for diagnosis", async () => {
    viewPrsSchedulerState.isQuickCheckInProgress = true;

    const result = await runViewPrsQuickCheck();

    expect(viewPrsSchedulerState.lastQuickCheckAt).toBeNull();
    expect(result).toEqual({ skipped: true, skipReason: "already-in-progress" });
    expect(viewPrsSchedulerState.lastQuickCheckAttemptAt).not.toBeNull();
    expect(viewPrsSchedulerState.lastQuickCheckSkipReason).toBe("already-in-progress");
    // Only the isAutoRunInProgress case should arm the auto-refresh
    // catch-up - a concurrent quick check resolves on its own shortly
    // (it's a cheap listing call), so there's no matching "finishes" hook to
    // retry from the way there is for a full auto-refresh.
    expect(viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress).toBe(false);
  });

  test("does nothing while a full auto-refresh run is in progress, and arms the catch-up flag", async () => {
    viewPrsSchedulerState.isAutoRunInProgress = true;

    const result = await runViewPrsQuickCheck();

    expect(viewPrsSchedulerState.lastQuickCheckAt).toBeNull();
    expect(result).toEqual({ skipped: true, skipReason: "already-in-progress" });
    expect(viewPrsSchedulerState.lastQuickCheckAttemptAt).not.toBeNull();
    expect(viewPrsSchedulerState.lastQuickCheckSkipReason).toBe("already-in-progress");
    expect(viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress).toBe(true);
  });

  test("records a skip reason for a missing-dependencies skip", async () => {
    appModule.getDependencyStatus = () => ({ ok: false, missing: ["gh"] });

    await runViewPrsQuickCheck();

    expect(viewPrsSchedulerState.lastQuickCheckSkipReason).toBe("missing dependencies: gh");
  });

  test("clears the skip reason once a quick check actually runs", async () => {
    viewPrsSchedulerState.lastQuickCheckSkipReason = "already-in-progress";
    appModule.runViewPrsScript = async () => ({
      stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }),
      stderr: "",
    });

    await withAutoRepos("acme-org/acme-repo", async () => {
      await runViewPrsQuickCheck();
    });

    expect(viewPrsSchedulerState.lastQuickCheckSkipReason).toBeNull();
  });

  test("does nothing when required dependencies are missing", async () => {
    appModule.getDependencyStatus = () => ({ ok: false, missing: ["gh"] });

    const result = await runViewPrsQuickCheck();

    expect(viewPrsSchedulerState.lastQuickCheckAt).toBeNull();
    expect(result).toEqual({
      skipped: true,
      skipReason: "missing-dependencies",
      missing: ["gh"],
    });
  });

  test("does nothing while the auto-refresh circuit is open", async () => {
    viewPrsSchedulerState.autoCircuitOpenUntil = new Date(
      Date.now() + 60 * 60 * 1000,
    ).toISOString();
    viewPrsSchedulerState.consecutiveAutoFailures = 3;

    const result = await runViewPrsQuickCheck();

    expect(viewPrsSchedulerState.lastQuickCheckAt).toBeNull();
    expect(result).toEqual({ skipped: true, skipReason: "circuit-open" });
  });

  test("records a successful check with no pending changes when nothing changed", async () => {
    appModule.runViewPrsScript = async () => ({
      stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }),
      stderr: "",
    });

    let result;
    await withAutoRepos("owner/repo-quickcheck", async () => {
      result = await runViewPrsQuickCheck();
    });

    expect(viewPrsSchedulerState.lastQuickCheckAt).not.toBeNull();
    expect(viewPrsSchedulerState.lastQuickCheckError).toBeNull();
    expect(viewPrsSchedulerState.isQuickCheckInProgress).toBe(false);
    expect(viewPrsSchedulerState.pendingByRepo["owner/repo-quickcheck"]).toBeUndefined();
    // Regression coverage: the return value is what the manual POST
    // /quick-check route reports back to the button - it must reflect
    // what THIS run found (all zero here), not any stale accumulated state.
    expect(result).toEqual({
      skipped: false,
      reposChecked: ["owner/repo-quickcheck"],
      reposFailed: [],
      newPendingOpenCount: 0,
      newPendingMergedClosedCount: 0,
      reposWithPendingOpen: [],
    });
  });

  test("clears a repo's stale pending flag once it reports no changes on a later check", async () => {
    viewPrsSchedulerState.pendingByRepo["owner/repo-stale-pending"] = {
      open: ["501"],
      mergedClosed: [],
    };
    appModule.runViewPrsScript = async () => ({
      stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }),
      stderr: "",
    });

    await withAutoRepos("owner/repo-stale-pending", async () => {
      await runViewPrsQuickCheck();
    });

    // Before this fix, a repo that used to have pending changes kept
    // reporting them forever once resolved, since the early-return path
    // for "nothing pending" never cleared the old entry.
    expect(viewPrsSchedulerState.pendingByRepo["owner/repo-stale-pending"]).toBeUndefined();
  });

  test("reports ok-shaped result with reposFailed populated when a repo's script call throws", async () => {
    appModule.runViewPrsScript = async (commandArgs) => {
      const repoFlagIndex = commandArgs.findIndex((arg) => arg === "--repo");
      const repo = repoFlagIndex >= 0 ? String(commandArgs[repoFlagIndex + 1] || "") : "";
      if (repo === "owner/repo-qc-fails") {
        throw new Error("gh rate limited");
      }
      return { stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }), stderr: "" };
    };

    let result;
    await withAutoRepos("owner/repo-qc-fails", async () => {
      result = await runViewPrsQuickCheck();
    });

    // A total failure still updates lastQuickCheckAt/clears lastQuickCheckError
    // (per-repo failures are handled, not fatal to the whole run) - the
    // *return value* is what distinguishes this from a clean pass, which is
    // exactly what the manual route needs to avoid reporting "No changes
    // found" for a check that never actually completed against GitHub.
    expect(viewPrsSchedulerState.lastQuickCheckError).toBeNull();
    expect(result).toEqual({
      skipped: false,
      reposChecked: [],
      reposFailed: [{ repo: "owner/repo-qc-fails", error: "gh rate limited" }],
      newPendingOpenCount: 0,
      newPendingMergedClosedCount: 0,
      reposWithPendingOpen: [],
    });
  });

  test("queues pending open PRs for a repo whose quick check reports changes", async () => {
    // A non-empty pendingOpen also fires a fire-and-forget fast-follow
    // runViewPrsAutoRefresh call (not awaited by runViewPrsQuickCheck),
    // which itself calls clearPendingForRepo on success - delaying the
    // (unflagged, i.e. non-quick-check) full-refresh script call keeps that
    // race from clearing pendingByRepo before this assertion runs.
    appModule.runViewPrsScript = async (commandArgs) => {
      const isQuickCheckCall = commandArgs.includes("--quick-check");
      if (!isQuickCheckCall) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { stdout: "", stderr: "" };
      }
      return {
        stdout: JSON.stringify({ pendingOpen: ["101"], pendingMergedClosed: [] }),
        stderr: "",
      };
    };

    await withAutoRepos("owner/repo-pending-open", async () => {
      await runViewPrsQuickCheck();
    });

    expect(viewPrsSchedulerState.pendingByRepo["owner/repo-pending-open"]).toEqual(
      expect.objectContaining({ open: ["101"], mergedClosed: [] }),
    );

    // Let the fire-and-forget fast-follow finish inside this test's own
    // lifetime instead of leaking into the next test / logging after Jest
    // considers the suite done.
    await new Promise((resolve) => setTimeout(resolve, 75));
  });

  test("routes its fast-follow refresh through the overridable module.exports.runViewPrsAutoRefresh, not the raw closure", async () => {
    // Regression test: the fast-follow call previously referenced the raw
    // runViewPrsAutoRefresh closure directly, so monkeypatching
    // module.exports.runViewPrsAutoRefresh (the pattern every other
    // overridable dependency in this file uses) silently had no effect here.
    appModule.runViewPrsScript = async () => ({
      stdout: JSON.stringify({ pendingOpen: ["202"], pendingMergedClosed: [] }),
      stderr: "",
    });

    let receivedArgs = null;
    const originalRunViewPrsAutoRefresh = appModule.runViewPrsAutoRefresh;
    appModule.runViewPrsAutoRefresh = async (args) => {
      receivedArgs = args;
    };

    try {
      await withAutoRepos("owner/repo-fast-follow-override", async () => {
        await runViewPrsQuickCheck({ awaitTargetedRefresh: true });
      });
    } finally {
      appModule.runViewPrsAutoRefresh = originalRunViewPrsAutoRefresh;
    }

    expect(receivedArgs).toEqual({ reposOverride: ["owner/repo-fast-follow-override"] });
  });

  test("given awaitTargetedRefresh, when a repo has pending open PRs, then the fast-follow full refresh actually finishes before returning (startup ordering: quick check's priority refresh completes before initializeScheduler moves on to the full update)", async () => {
    appModule.runViewPrsScript = async (commandArgs) => {
      const isQuickCheckCall = commandArgs.includes("--quick-check");
      if (!isQuickCheckCall) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { stdout: "", stderr: "" };
      }
      return {
        stdout: JSON.stringify({ pendingOpen: ["101"], pendingMergedClosed: [] }),
        stderr: "",
      };
    };

    await withAutoRepos("owner/repo-pending-open-awaited", async () => {
      await runViewPrsQuickCheck({ awaitTargetedRefresh: true });
    });

    // The fast-follow full refresh (which takes 50ms, per the mock above)
    // has already run to completion and cleared this repo's pending flag -
    // unlike the fire-and-forget version above, no extra wait is needed
    // after runViewPrsQuickCheck() itself returns.
    expect(viewPrsSchedulerState.pendingByRepo["owner/repo-pending-open-awaited"]).toBeUndefined();
  });

  test("queues pending merged/closed PRs without them counting as pending-open", async () => {
    appModule.runViewPrsScript = async () => ({
      stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: ["202"] }),
      stderr: "",
    });

    await withAutoRepos("owner/repo-pending-merged", async () => {
      await runViewPrsQuickCheck();
    });

    expect(viewPrsSchedulerState.pendingByRepo["owner/repo-pending-merged"]).toEqual(
      expect.objectContaining({ open: [], mergedClosed: ["202"] }),
    );
  });

  test("continues checking other repos and records no top-level error when one repo's quick check fails", async () => {
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    appModule.runViewPrsScript = async (commandArgs) => {
      const repoFlagIndex = commandArgs.findIndex((arg) => arg === "--repo");
      const repo = repoFlagIndex >= 0 ? String(commandArgs[repoFlagIndex + 1] || "") : "";
      if (repo === "owner/repo-failing") {
        throw new Error("quick-check script failed");
      }
      return { stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }), stderr: "" };
    };

    try {
      await withAutoRepos("owner/repo-failing,owner/repo-ok", async () => {
        await runViewPrsQuickCheck();
      });

      expect(viewPrsSchedulerState.lastQuickCheckError).toBeNull();
      expect(viewPrsSchedulerState.lastQuickCheckAt).not.toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("quick-check failed for owner/repo-failing"),
      );
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  test("treats unparseable script output as no pending changes rather than throwing", async () => {
    appModule.runViewPrsScript = async () => ({ stdout: "not json", stderr: "" });

    await withAutoRepos("owner/repo-bad-json", async () => {
      await runViewPrsQuickCheck();
    });

    expect(viewPrsSchedulerState.lastQuickCheckError).toBeNull();
    expect(viewPrsSchedulerState.pendingByRepo["owner/repo-bad-json"]).toBeUndefined();
  });
});

describe("runViewPrsMergedQueueDrain behavior", () => {
  const savedRunViewPrsScript = appModule.runViewPrsScript;

  beforeEach(() => {
    resetSchedulerState();
    viewPrsSchedulerState.pendingByRepo = {};
    viewPrsSchedulerState.lastMergedDrainAt = null;
    appModule.getDependencyStatus = () => ({ ok: true, missing: [] });
    appModule.runViewPrsScript = async () => ({ stdout: "", stderr: "" });
  });

  afterAll(() => {
    if (savedRunViewPrsScript !== undefined) {
      appModule.runViewPrsScript = savedRunViewPrsScript;
    } else {
      delete appModule.runViewPrsScript;
    }
  });

  test("records the drain attempt and does nothing else when nothing is queued", async () => {
    await runViewPrsMergedQueueDrain();

    expect(viewPrsSchedulerState.lastMergedDrainAt).not.toBeNull();
    expect(viewPrsSchedulerState.isAutoRunInProgress).toBe(false);
  });

  test("runs a full refresh for repos with a queued merged/closed change", async () => {
    viewPrsSchedulerState.pendingByRepo["owner/repo-drain"] = {
      open: [],
      mergedClosed: ["301"],
    };

    const observedRepos = [];
    appModule.runViewPrsScript = async (commandArgs) => {
      const repoFlagIndex = commandArgs.findIndex((arg) => arg === "--repo");
      observedRepos.push(
        repoFlagIndex >= 0 ? String(commandArgs[repoFlagIndex + 1] || "") : "",
      );
      return { stdout: "", stderr: "" };
    };

    await runViewPrsMergedQueueDrain();

    expect(observedRepos).toContain("owner/repo-drain");
    // A successful full refresh clears whatever the quick-check queued.
    expect(viewPrsSchedulerState.pendingByRepo["owner/repo-drain"]).toBeUndefined();
  });

  test("routes its refresh through the overridable module.exports.runViewPrsAutoRefresh, not the raw closure", async () => {
    viewPrsSchedulerState.pendingByRepo["owner/repo-drain-override"] = {
      open: [],
      mergedClosed: ["301"],
    };

    let receivedArgs = null;
    const originalRunViewPrsAutoRefresh = appModule.runViewPrsAutoRefresh;
    appModule.runViewPrsAutoRefresh = async (args) => {
      receivedArgs = args;
    };

    try {
      await runViewPrsMergedQueueDrain();
    } finally {
      appModule.runViewPrsAutoRefresh = originalRunViewPrsAutoRefresh;
    }

    expect(receivedArgs).toEqual({ reposOverride: ["owner/repo-drain-override"] });
  });

  test("skips a repo that also has a pending open change, leaving it for the fast-follow path instead", async () => {
    viewPrsSchedulerState.pendingByRepo["owner/repo-both-pending"] = {
      open: ["401"],
      mergedClosed: ["402"],
    };

    const observedRepos = [];
    appModule.runViewPrsScript = async (commandArgs) => {
      const repoFlagIndex = commandArgs.findIndex((arg) => arg === "--repo");
      observedRepos.push(
        repoFlagIndex >= 0 ? String(commandArgs[repoFlagIndex + 1] || "") : "",
      );
      return { stdout: "", stderr: "" };
    };

    await runViewPrsMergedQueueDrain();

    expect(observedRepos).not.toContain("owner/repo-both-pending");
    expect(viewPrsSchedulerState.pendingByRepo["owner/repo-both-pending"]).toEqual(
      expect.objectContaining({ open: ["401"], mergedClosed: ["402"] }),
    );
  });
});
