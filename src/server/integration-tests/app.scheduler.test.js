const fs = require("fs");
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
  recordViewPrsAutoRefreshFailure,
  resetAutoCircuitFailuresForRepos,
  resetAutoCircuitBreaker,
  getOpenAutoCircuitRepos,
  initializeScheduler,
  viewPrsSchedulerState,
  viewPrsSchedulerFile,
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
  viewPrsSchedulerState.quickCheckSkippedRepos = new Set();
  viewPrsSchedulerState.autoRefreshInProgressRepos = new Set();
  viewPrsSchedulerState.quickCheckInProgressRepos = new Set();
  viewPrsSchedulerState.pendingByRepo = {};
  // The per-repo dispatcher registry (see view-prs-dispatcher-helpers.js)
  // persists across tests otherwise - entries for a repo one test's own
  // withAutoRepos/env override registered would leak into every later
  // test's own dispatch ticks, since getOrInitRegistry only ever adds
  // entries, never removes stale ones for a repo no longer configured.
  viewPrsSchedulerState.dispatcher = { entries: {}, reservedGhSlots: 0 };
  // Also delete the ON-DISK scheduler state file (a real temp file shared
  // by every test in this worker - see jest.setup.env.js): any test that
  // calls initializeScheduler() has it call readViewPrsSchedulerState()
  // first, which would otherwise read back a PREVIOUS test's own persisted
  // dispatcher entries (written by persistViewPrsSchedulerState, called
  // from inside a real quick-check/auto-refresh run) and clobber the
  // in-memory reset above with stale isRunning/nextDueAt/lastFinishedAt
  // data - confirmed as the root cause of a cross-test leak where a repo's
  // quickCheck entry looked "already run 5 minutes ago" in a test that had
  // only just created it.
  try {
    fs.rmSync(viewPrsSchedulerFile, { force: true });
  } catch (_error) {
    // Best-effort - a missing file is exactly the desired end state anyway.
  }
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

    test("with a repo and no explicit autoCircuitOpenUntil, resolves against that repo's own breaker entry", () => {
      viewPrsSchedulerState.autoCircuitByRepo["owner/repo-open"] = {
        consecutiveFailures: 3,
        circuitOpenUntil: "2026-03-11T10:20:00Z",
        lastCircuitOpenedAt: "2026-03-11T10:10:00Z",
      };

      const openResult = getViewPrsAutoCircuitOpenState({
        nowMs: Date.parse("2026-03-11T10:14:00Z"),
        repo: "owner/repo-open",
      });
      expect(openResult).toEqual({ isOpen: true, openUntilIso: "2026-03-11T10:20:00.000Z" });

      // A different, unrelated repo with no breaker entry at all is closed.
      const closedResult = getViewPrsAutoCircuitOpenState({
        nowMs: Date.parse("2026-03-11T10:14:00Z"),
        repo: "owner/repo-untouched",
      });
      expect(closedResult).toEqual({ isOpen: false, openUntilIso: null });

      delete viewPrsSchedulerState.autoCircuitByRepo["owner/repo-open"];
    });

    test("an explicit autoCircuitOpenUntil still takes precedence over a repo's own breaker entry", () => {
      viewPrsSchedulerState.autoCircuitByRepo["owner/repo-override"] = {
        consecutiveFailures: 3,
        circuitOpenUntil: "2026-03-11T10:20:00Z",
        lastCircuitOpenedAt: "2026-03-11T10:10:00Z",
      };

      const result = getViewPrsAutoCircuitOpenState({
        nowMs: Date.parse("2026-03-11T10:14:00Z"),
        repo: "owner/repo-override",
        autoCircuitOpenUntil: null,
      });

      expect(result).toEqual({ isOpen: false, openUntilIso: null });
      delete viewPrsSchedulerState.autoCircuitByRepo["owner/repo-override"];
    });
  });

  describe("recordViewPrsAutoRefreshFailure / resetAutoCircuitFailuresForRepos / resetAutoCircuitBreaker (per-repo)", () => {
    beforeEach(() => {
      viewPrsSchedulerState.autoCircuitByRepo = {};
    });

    test("only increments the failed repo's own counter, leaving an unrelated repo's breaker untouched", () => {
      recordViewPrsAutoRefreshFailure(["owner/repo-x"]);
      recordViewPrsAutoRefreshFailure(["owner/repo-x"]);

      expect(viewPrsSchedulerState.autoCircuitByRepo["owner/repo-x"].consecutiveFailures).toBe(2);
      expect(viewPrsSchedulerState.autoCircuitByRepo["owner/repo-y"]).toBeUndefined();
    });

    test("opens only the failing repo's own circuit once its threshold is reached, not every repo's", () => {
      recordViewPrsAutoRefreshFailure(["owner/repo-flaky"]);
      recordViewPrsAutoRefreshFailure(["owner/repo-flaky"]);
      recordViewPrsAutoRefreshFailure(["owner/repo-flaky"]);

      expect(getOpenAutoCircuitRepos()).toEqual(["owner/repo-flaky"]);
      expect(viewPrsSchedulerState.lastAutoSkipReason).toMatch(/owner\/repo-flaky/);
    });

    test("resetAutoCircuitFailuresForRepos only resets the repos actually passed in", () => {
      recordViewPrsAutoRefreshFailure(["owner/repo-a", "owner/repo-b"]);
      resetAutoCircuitFailuresForRepos(["owner/repo-a"]);

      expect(viewPrsSchedulerState.autoCircuitByRepo["owner/repo-a"].consecutiveFailures).toBe(0);
      expect(viewPrsSchedulerState.autoCircuitByRepo["owner/repo-b"].consecutiveFailures).toBe(1);
    });

    test("resetAutoCircuitBreaker({repo}) clears only that one repo, leaving others alone", () => {
      recordViewPrsAutoRefreshFailure(["owner/repo-a", "owner/repo-b"]);
      resetAutoCircuitBreaker({ repo: "owner/repo-a" });

      expect(viewPrsSchedulerState.autoCircuitByRepo["owner/repo-a"]).toBeUndefined();
      expect(viewPrsSchedulerState.autoCircuitByRepo["owner/repo-b"].consecutiveFailures).toBe(1);
    });

    test("resetAutoCircuitBreaker({repos}) scoped to one repo does not clear lastAutoSkipReason about a DIFFERENT, still-open repo", () => {
      // Regression: resetAutoCircuitBreaker's lastAutoSkipReason-clearing
      // used to only check whether the message said "circuit open" at
      // all, not which repo it was about - a scoped reset for an unrelated
      // repo (e.g. /run-auto's own internal reset, which runs on every
      // call regardless of whether that repo was ever open) would wrongly
      // wipe a still-valid message about a different repo's open circuit.
      recordViewPrsAutoRefreshFailure(["owner/repo-a"]);
      recordViewPrsAutoRefreshFailure(["owner/repo-a"]);
      recordViewPrsAutoRefreshFailure(["owner/repo-a"]);
      expect(viewPrsSchedulerState.lastAutoSkipReason).toMatch(/owner\/repo-a/);

      resetAutoCircuitBreaker({ repos: ["owner/repo-unrelated"] });

      expect(viewPrsSchedulerState.lastAutoSkipReason).toMatch(/owner\/repo-a/);
      expect(getOpenAutoCircuitRepos()).toContain("owner/repo-a");

      // Resetting the repo the message is ACTUALLY about does clear it.
      resetAutoCircuitBreaker({ repos: ["owner/repo-a"] });
      expect(viewPrsSchedulerState.lastAutoSkipReason).toBeNull();
    });

    test("resetAutoCircuitBreaker() with no args clears every repo's breaker", () => {
      recordViewPrsAutoRefreshFailure(["owner/repo-a", "owner/repo-b"]);
      resetAutoCircuitBreaker();

      expect(viewPrsSchedulerState.autoCircuitByRepo).toEqual({});
    });

    test("the flat aggregate fields reflect the worst case (highest failure count, soonest-still-open circuit) across every repo", () => {
      recordViewPrsAutoRefreshFailure(["owner/repo-a"]);
      recordViewPrsAutoRefreshFailure(["owner/repo-b"]);
      recordViewPrsAutoRefreshFailure(["owner/repo-b"]);
      recordViewPrsAutoRefreshFailure(["owner/repo-b"]);

      expect(viewPrsSchedulerState.consecutiveAutoFailures).toBe(3);
      expect(viewPrsSchedulerState.autoCircuitOpenUntil).not.toBeNull();
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
    // No-override auto refresh targets every configured repo - populate
    // that same repo's own circuit breaker entry (circuit breaker is now
    // per-repo - see autoCircuitByRepo's own comment in app.js).
    const openUntilIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    getViewPrsAutoRefreshRepos().forEach((repo) => {
      viewPrsSchedulerState.autoCircuitByRepo[repo] = {
        consecutiveFailures: 3,
        circuitOpenUntil: openUntilIso,
        lastCircuitOpenedAt: new Date().toISOString(),
      };
    });

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

  test("does not start a second run when runViewPrsAutoRefresh is called during an active run for the same repo(s)", async () => {
    viewPrsSchedulerState.isAutoRunInProgress = true;
    // No-override auto refresh targets every configured repo - populate
    // autoRefreshInProgressRepos with that same set for a genuine
    // full-overlap collision (auto refresh is now per-repo-aware - see
    // autoRefreshInProgressRepos's own comment in app.js).
    viewPrsSchedulerState.autoRefreshInProgressRepos = new Set(
      getViewPrsAutoRefreshRepos(),
    );

    await runViewPrsAutoRefresh({ skipCooldownChecks: true });

    // lastAutoAttemptAt should remain unset since we returned early
    expect(viewPrsSchedulerState.lastAutoAttemptAt).toBeNull();
    // isAutoRunInProgress should still be true — we didn't touch it
    expect(viewPrsSchedulerState.isAutoRunInProgress).toBe(true);

    // Clean up for subsequent tests
    viewPrsSchedulerState.isAutoRunInProgress = false;
    viewPrsSchedulerState.autoRefreshInProgressRepos = new Set();
  });

  test("clears isAutoRunInProgress when runViewPrsAutoRefresh finishes successfully", async () => {
    await runViewPrsAutoRefresh({ skipCooldownChecks: true });

    expect(viewPrsSchedulerState.isAutoRunInProgress).toBe(false);
  });

  test("refreshes the free repo and skips only the one whose auto refresh is already in progress, instead of blocking the whole call", async () => {
    viewPrsSchedulerState.autoRefreshInProgressRepos = new Set(["owner/repo-ar-busy"]);
    const scriptCalls = [];
    appModule.runViewPrsScript = async (commandArgs) => {
      const repoIndex = commandArgs.indexOf("--repo");
      scriptCalls.push(repoIndex >= 0 ? commandArgs[repoIndex + 1] : null);
      return { stdout: "", stderr: "" };
    };

    await runViewPrsAutoRefresh({
      skipCooldownChecks: true,
      reposOverride: ["owner/repo-ar-busy", "owner/repo-ar-free"],
    });

    // Only the free repo's script call actually happened.
    expect(scriptCalls).toEqual(["owner/repo-ar-free"]);
    expect(viewPrsSchedulerState.lastAutoAttemptAt).toBeTruthy();
    // isAutoRunInProgress reflects the Set's size - still true because
    // owner/repo-ar-busy's OWN (external, simulated) claim is still there,
    // not because this call left anything running itself.
    expect(viewPrsSchedulerState.isAutoRunInProgress).toBe(true);
    expect(viewPrsSchedulerState.autoRefreshInProgressRepos.has("owner/repo-ar-free")).toBe(
      false,
    );
    expect(viewPrsSchedulerState.autoRefreshInProgressRepos.has("owner/repo-ar-busy")).toBe(
      true,
    );
  });

  test("refreshes the free repo and skips only the one whose own circuit breaker is open, instead of blocking the whole call", async () => {
    viewPrsSchedulerState.autoCircuitByRepo["owner/repo-cb-open"] = {
      consecutiveFailures: 3,
      circuitOpenUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      lastCircuitOpenedAt: new Date().toISOString(),
    };
    const scriptCalls = [];
    appModule.runViewPrsScript = async (commandArgs) => {
      const repoIndex = commandArgs.indexOf("--repo");
      scriptCalls.push(repoIndex >= 0 ? commandArgs[repoIndex + 1] : null);
      return { stdout: "", stderr: "" };
    };

    // skipCooldownChecks NOT set (false) - the circuit check only runs
    // when cooldown checks aren't bypassed.
    await runViewPrsAutoRefresh({
      reposOverride: ["owner/repo-cb-open", "owner/repo-cb-free"],
    });

    // Only the free repo's script call actually happened - the other
    // repo's OWN open circuit didn't block it.
    expect(scriptCalls).toEqual(["owner/repo-cb-free"]);
    expect(viewPrsSchedulerState.lastAutoAttemptAt).toBeTruthy();
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
    viewPrsSchedulerState.quickCheckSkippedRepos = new Set(["owner/repo-starved"]);
    let quickCheckRunCount = 0;
    let quickCheckRunArgs = null;
    appModule.runViewPrsQuickCheck = async (args) => {
      quickCheckRunCount += 1;
      quickCheckRunArgs = args;
      return { skipped: false, reposChecked: [], reposFailed: [] };
    };

    try {
      await runViewPrsAutoRefresh({ skipCooldownChecks: true });
      // The catch-up is fire-and-forget (void runViewPrsQuickCheck()) -
      // give its microtask a turn to run before asserting.
      await new Promise((resolve) => setImmediate(resolve));

      expect(quickCheckRunCount).toBe(1);
      // Scoped to exactly the repos that were actually starved, not every
      // configured repo (today's correctness improvement over the old
      // blind "re-check everything" catch-up).
      expect(quickCheckRunArgs).toEqual({
        repoRequests: [{ repo: "owner/repo-starved" }],
      });
      expect(viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress).toBe(false);
      expect(viewPrsSchedulerState.quickCheckSkippedRepos.size).toBe(0);
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
    let quickCheckCallCount = 0;
    appModule.runViewPrsScript = async (commandArgs) => {
      const isQuickCheck = commandArgs.includes("--quick-check");
      calls.push(isQuickCheck ? "quick-check" : "full-refresh");
      if (isQuickCheck) {
        quickCheckCallCount += 1;
        // Reports a pending open change on the FIRST quick check only -
        // same as real usage, where autoRefresh's own fast-follow fetch
        // updates the cached updatedAt, so a repeat quick check of the same
        // PR stops reporting it as changed. Reporting it on every call
        // would keep re-bumping the dispatcher's autoRefresh entry forever
        // (bumpEntryUrgent -> immediate tick -> autoRefresh runs -> its own
        // quickCheckSkippedWhileAutoRunInProgress catch-up -> quick check
        // again -> pendingOpen again -> ...), a self-sustaining loop that's
        // a test-fixture artifact, not a real steady state.
        return {
          stdout: JSON.stringify(
            quickCheckCallCount === 1
              ? { pendingOpen: ["1"], pendingMergedClosed: [] }
              : { pendingOpen: [], pendingMergedClosed: [] },
          ),
          stderr: "",
        };
      }
      return { stdout: "", stderr: "" };
    };

    try {
      initializeScheduler();

      // Everything above is mocked to resolve near-instantly; this just
      // gives the unawaited startup chain (quick check -> its targeted
      // fast-follow bump + tick -> the dispatcher's own full update) room
      // to actually run.
      await new Promise((resolve) => setTimeout(resolve, 200));

      // The first call must be the quick check (it has the highest default
      // priority, see view-prs-dispatcher-helpers.js), and it must be
      // followed by at least one full-refresh call (the fast-follow, and/or
      // the dispatcher's own due-now autoRefresh entry) - never a
      // full-refresh before any quick check has run at all.
      expect(calls[0]).toBe("quick-check");
      expect(calls.filter((call) => call === "full-refresh").length).toBeGreaterThanOrEqual(1);
    } finally {
      createdIntervals.forEach((id) => clearInterval(id));
      setIntervalSpy.mockRestore();
      // Let anything still in flight finish inside this test's own
      // lifetime instead of leaking into the next test.
      await new Promise((resolve) => setTimeout(resolve, 100));
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

  test("initializeScheduler registers exactly one periodic setInterval, driving runDispatcherTick through the overridable module.exports function", async () => {
    // Regression test, updated for the dispatcher cutover: the three
    // independent setInterval(...) registrations (one per job) are gone -
    // there is now exactly one, driving the dispatcher's own tick, which in
    // turn is itself overridable (same "always re-check module.exports.X
    // fresh" pattern every other call site in this file already uses).
    // Verified by invoking the captured callback directly rather than
    // waiting on the real tick interval.
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

    const originalRunDispatcherTick = appModule.runDispatcherTick;
    let tickCount = 0;
    appModule.runDispatcherTick = async () => {
      tickCount += 1;
    };

    try {
      initializeScheduler();
      // initializeScheduler's own unawaited startup call also ticks once -
      // let that settle first so only the *periodic* interval tick below
      // is counted.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const tickCountAfterStartup = tickCount;

      expect(registeredCallbacks).toHaveLength(1);
      await Promise.all(registeredCallbacks.map((callback) => callback()));

      expect(tickCount).toBe(tickCountAfterStartup + 1);
    } finally {
      createdIntervals.forEach((id) => clearInterval(id));
      setIntervalSpy.mockRestore();
      appModule.runDispatcherTick = originalRunDispatcherTick;
    }
  });

  test("on startup, a repo whose quick check also reports a pending open change is not double-refreshed", async () => {
    // Under the dispatcher model there's no separate "targeted pass" vs.
    // "follow-up full update" to keep from double-covering a repo (see
    // REACT_MIGRATION_PLAN.md) - autoRefresh-for-a-repo is one registry
    // entry, selectable at most once per tick, so this is now a structural
    // guarantee rather than bespoke dedup logic. Still worth a regression
    // test: "acme-org/acme-repo" is due at startup AND has its autoRefresh
    // entry bumped by its own quick check's pendingOpen finding - either
    // path alone would refresh it once; together they still must not
    // refresh it twice.
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
    const quickCheckCallCountByRepo = {};
    appModule.runViewPrsScript = async (commandArgs) => {
      const repoIndex = commandArgs.indexOf("--repo");
      const repo = repoIndex !== -1 ? commandArgs[repoIndex + 1] : null;
      if (commandArgs.includes("--quick-check")) {
        quickCheckCallCountByRepo[repo] = (quickCheckCallCountByRepo[repo] || 0) + 1;
        // Only the fixture's own repo reports a pending open change, and
        // only on its first quick check - see the "runs the quick check...
        // before the full every-repo update" test above for why an
        // always-pending mock creates a self-sustaining loop rather than a
        // realistic one-time finding.
        const pendingOpen =
          repo === "acme-org/acme-repo" && quickCheckCallCountByRepo[repo] === 1 ? ["1"] : [];
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
      // 2 repos x 3 task types can exceed the default gh-process budget in
      // a single tick (quickCheck cost 1 + autoRefresh/mergedDrain cost 4
      // each, per repo) - whatever didn't fit in the first tick is still
      // due, not lost, and picked up by the next one. Force that next tick
      // directly rather than waiting out the real (multi-second) interval.
      await appModule.runDispatcherTick();

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
      // Let anything still in flight finish inside this test's own
      // lifetime instead of leaking into the next test.
      await new Promise((resolve) => setTimeout(resolve, 100));
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
    viewPrsSchedulerState.quickCheckSkippedRepos = new Set();
    viewPrsSchedulerState.autoRefreshInProgressRepos = new Set();
    viewPrsSchedulerState.quickCheckInProgressRepos = new Set();
    viewPrsSchedulerState.pendingByRepo = {};
    viewPrsSchedulerState.autoCircuitOpenUntil = null;
    viewPrsSchedulerState.consecutiveAutoFailures = 0;
    viewPrsSchedulerState.autoCircuitByRepo = {};
    // See resetSchedulerState's own comment above for why this (and the
    // on-disk file delete right after) is needed every test, not just once.
    viewPrsSchedulerState.dispatcher = { entries: {}, reservedGhSlots: 0 };
    try {
      fs.rmSync(viewPrsSchedulerFile, { force: true });
    } catch (_error) {
      // Best-effort.
    }
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
    // No-arg quick check targets every configured repo - populate
    // quickCheckInProgressRepos with that same set for a genuine
    // full-overlap collision (quick check is now per-repo-aware).
    viewPrsSchedulerState.quickCheckInProgressRepos = new Set(
      getViewPrsAutoRefreshRepos(),
    );

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
    // Quick check with no args targets every configured repo - populate
    // autoRefreshInProgressRepos with that same set for a genuine
    // full-overlap collision (quick check is now per-repo-aware - see
    // autoRefreshInProgressRepos's own comment in app.js).
    viewPrsSchedulerState.autoRefreshInProgressRepos = new Set(
      appModule.getViewPrsAutoRefreshRepos(),
    );

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
    // No-arg quick check targets every configured repo - populate that
    // same repo's own circuit breaker entry (circuit breaker is now
    // per-repo - see autoCircuitByRepo's own comment in app.js).
    const openUntilIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    getViewPrsAutoRefreshRepos().forEach((repo) => {
      viewPrsSchedulerState.autoCircuitByRepo[repo] = {
        consecutiveFailures: 3,
        circuitOpenUntil: openUntilIso,
        lastCircuitOpenedAt: new Date().toISOString(),
      };
    });

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
      reposSkippedForAutoRefresh: [],
      reposSkippedForQuickCheckInProgress: [],
      reposSkippedForCircuitOpen: [],
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
      reposSkippedForAutoRefresh: [],
      reposSkippedForQuickCheckInProgress: [],
      reposSkippedForCircuitOpen: [],
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

  test("bumps the dispatcher's autoRefresh entry for a repo with newly-pending open PRs, and triggers an immediate dispatch tick", async () => {
    // Fast-follow is now expressed through the dispatcher registry (see
    // view-prs-dispatcher-helpers.js) rather than a direct
    // runViewPrsAutoRefresh call - bumpEntryUrgent makes the entry
    // immediately due, and a tick is triggered right away so it's picked up
    // with no added latency. Overriding module.exports.runDispatcherTick to
    // a spy (rather than letting the real tick cascade) isolates "did
    // quickCheck bump the right entry and ask for a tick" from "does a tick
    // actually run the right function for a due entry" - the latter is
    // covered end-to-end by app.dispatcher-tick.test.js.
    appModule.runViewPrsScript = async () => ({
      stdout: JSON.stringify({ pendingOpen: ["202"], pendingMergedClosed: [] }),
      stderr: "",
    });

    const originalRunDispatcherTick = appModule.runDispatcherTick;
    let dispatcherTickCalled = false;
    appModule.runDispatcherTick = async () => {
      dispatcherTickCalled = true;
    };

    try {
      await withAutoRepos("owner/repo-fast-follow-override", async () => {
        await runViewPrsQuickCheck();
      });
    } finally {
      appModule.runDispatcherTick = originalRunDispatcherTick;
    }

    expect(dispatcherTickCalled).toBe(true);
    expect(
      viewPrsSchedulerState.dispatcher.entries["owner/repo-fast-follow-override::autoRefresh"]
        .nextDueAt,
    ).not.toBeNull();
    expect(
      Date.parse(
        viewPrsSchedulerState.dispatcher.entries["owner/repo-fast-follow-override::autoRefresh"]
          .nextDueAt,
      ),
    ).toBeLessThanOrEqual(Date.now());
  });

  test("bumps the dispatcher's mergedDrain entry for a repo with newly-pending merged/closed PRs (the priority-inversion bug fix)", async () => {
    // Before this round, a merged/closed change only sat flagged until
    // mergedQueueDrain's own fixed (and, at default config, actually
    // *longer* than autoRefresh's) interval - see
    // REACT_MIGRATION_PLAN.md. It now gets the exact same immediate
    // fast-follow treatment open-PR changes have always had.
    appModule.runViewPrsScript = async () => ({
      stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: ["303"] }),
      stderr: "",
    });

    const originalRunDispatcherTick = appModule.runDispatcherTick;
    let dispatcherTickCalled = false;
    appModule.runDispatcherTick = async () => {
      dispatcherTickCalled = true;
    };

    try {
      await withAutoRepos("owner/repo-merged-drain-bump", async () => {
        await runViewPrsQuickCheck();
      });
    } finally {
      appModule.runDispatcherTick = originalRunDispatcherTick;
    }

    expect(dispatcherTickCalled).toBe(true);
    const mergedDrainEntry =
      viewPrsSchedulerState.dispatcher.entries["owner/repo-merged-drain-bump::mergedDrain"];
    expect(mergedDrainEntry).toBeDefined();
    expect(Date.parse(mergedDrainEntry.nextDueAt)).toBeLessThanOrEqual(Date.now());
  });

  test("queues pending merged/closed PRs without them counting as pending-open", async () => {
    // A non-empty pendingMergedClosed also fires a fire-and-forget fast-follow
    // mergedDrain (not awaited by runViewPrsQuickCheck) - the actual fix for
    // the priority-inversion bug this round closed (see
    // REACT_MIGRATION_PLAN.md). Delaying the non-quick-check script call
    // keeps that race from clearing pendingByRepo before this assertion
    // runs, same technique the pending-*open* test above already uses.
    appModule.runViewPrsScript = async (commandArgs) => {
      const isQuickCheckCall = commandArgs.includes("--quick-check");
      if (!isQuickCheckCall) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { stdout: "", stderr: "" };
      }
      return {
        stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: ["202"] }),
        stderr: "",
      };
    };

    await withAutoRepos("owner/repo-pending-merged", async () => {
      await runViewPrsQuickCheck();
    });

    expect(viewPrsSchedulerState.pendingByRepo["owner/repo-pending-merged"]).toEqual(
      expect.objectContaining({ open: [], mergedClosed: ["202"] }),
    );

    // Let the fire-and-forget fast-follow finish inside this test's own
    // lifetime instead of leaking into the next test.
    await new Promise((resolve) => setTimeout(resolve, 75));
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

  describe("with explicit prNumbers", () => {
    test("checks only the given repo via --quick-check-numbers, not every configured repo", async () => {
      const scriptCalls = [];
      // No pendingOpen/pendingMergedClosed here deliberately - this test is
      // isolating single-repo scoping, not the (separately covered)
      // fast-follow behavior either kind of pending change triggers.
      appModule.runViewPrsScript = async (commandArgs) => {
        scriptCalls.push(commandArgs);
        return {
          stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }),
          stderr: "",
        };
      };

      let result;
      await withAutoRepos("owner/repo-a,owner/repo-b", async () => {
        result = await runViewPrsQuickCheck({ repo: "owner/repo-a", prNumbers: "501,502" });
      });

      // A single script invocation for the entered repo only - the other
      // configured repo (owner/repo-b) is never touched by this path.
      expect(scriptCalls).toHaveLength(1);
      expect(scriptCalls[0]).toEqual(
        expect.arrayContaining(["--repo", "owner/repo-a", "--quick-check-numbers", "501,502"]),
      );
      expect(result.reposChecked).toEqual(["owner/repo-a"]);
      expect(viewPrsSchedulerState.pendingByRepo["owner/repo-b"]).toBeUndefined();
    });

    test("still records pending merged/closed PRs found via the numbers path", async () => {
      appModule.runViewPrsScript = async () => ({
        stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: ["501"] }),
        stderr: "",
      });

      const result = await runViewPrsQuickCheck({ repo: "owner/repo-a", prNumbers: "501" });

      expect(result.newPendingMergedClosedCount).toBe(1);
      expect(viewPrsSchedulerState.pendingByRepo["owner/repo-a"]).toEqual(
        expect.objectContaining({ open: [], mergedClosed: ["501"] }),
      );
    });

    test("omitting prNumbers still exercises the existing all-repos default path", async () => {
      const scriptCalls = [];
      appModule.runViewPrsScript = async (commandArgs) => {
        scriptCalls.push(commandArgs);
        return { stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }), stderr: "" };
      };

      await withAutoRepos("owner/repo-a,owner/repo-b", async () => {
        await runViewPrsQuickCheck();
      });

      expect(scriptCalls).toHaveLength(2);
      expect(scriptCalls.every((args) => !args.includes("--quick-check-numbers"))).toBe(true);
    });
  });

  describe("with repoRequests (Quick Check All)", () => {
    test("checks each repo sequentially, one script call per repo, with the bulk --jobs and timeout", async () => {
      const scriptCalls = [];
      const scriptOptions = [];
      // No pending changes here deliberately - this test isolates the
      // per-repo sequential call shape, not the (separately covered)
      // fast-follow bump either kind of pending change triggers.
      appModule.runViewPrsScript = async (commandArgs, _maxBufferBytes, options) => {
        scriptCalls.push(commandArgs);
        scriptOptions.push(options);
        return {
          stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }),
          stderr: "",
        };
      };

      const result = await runViewPrsQuickCheck({
        repoRequests: [
          { repo: "owner/repo-a", prNumbers: "501,502" },
          { repo: "owner/repo-b", prNumbers: "601" },
        ],
      });

      expect(scriptCalls).toHaveLength(2);
      expect(scriptCalls[0]).toEqual(
        expect.arrayContaining([
          "--repo",
          "owner/repo-a",
          "--jobs",
          "12",
          "--quick-check-numbers",
          "501,502",
        ]),
      );
      expect(scriptCalls[1]).toEqual(
        expect.arrayContaining([
          "--repo",
          "owner/repo-b",
          "--jobs",
          "12",
          "--quick-check-numbers",
          "601",
        ]),
      );
      // A much bigger budget than the default single-listing-call timeout,
      // since this path does one gh pr view call per PR number.
      expect(scriptOptions[0].timeoutMs).toBe(300000);
      expect(scriptOptions[1].timeoutMs).toBe(300000);
      expect(result.reposChecked).toEqual(["owner/repo-a", "owner/repo-b"]);
    });

    test("one repo failing doesn't stop the rest, and is reported in reposFailed", async () => {
      appModule.runViewPrsScript = async (commandArgs) => {
        const repoFlagIndex = commandArgs.findIndex((arg) => arg === "--repo");
        const repo = repoFlagIndex >= 0 ? String(commandArgs[repoFlagIndex + 1] || "") : "";
        if (repo === "owner/repo-broken") {
          throw new Error("gh rate limited");
        }
        return { stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }), stderr: "" };
      };

      const result = await runViewPrsQuickCheck({
        repoRequests: [
          { repo: "owner/repo-broken", prNumbers: "1" },
          { repo: "owner/repo-fine", prNumbers: "2" },
        ],
      });

      expect(result.reposChecked).toEqual(["owner/repo-fine"]);
      expect(result.reposFailed).toEqual([
        expect.objectContaining({ repo: "owner/repo-broken" }),
      ]);
    });

    test("still fast-follows (bumps the dispatcher's autoRefresh entry) for a repo with newly-pending open PRs", async () => {
      const originalRunDispatcherTick = appModule.runDispatcherTick;
      let dispatcherTickCalled = false;
      appModule.runDispatcherTick = async () => {
        dispatcherTickCalled = true;
      };
      appModule.runViewPrsScript = async () => ({
        stdout: JSON.stringify({ pendingOpen: ["501"], pendingMergedClosed: [] }),
        stderr: "",
      });

      try {
        await withAutoRepos("owner/repo-a", async () => {
          await runViewPrsQuickCheck({
            repoRequests: [{ repo: "owner/repo-a", prNumbers: "501" }],
          });
        });

        expect(dispatcherTickCalled).toBe(true);
        expect(
          Date.parse(
            viewPrsSchedulerState.dispatcher.entries["owner/repo-a::autoRefresh"].nextDueAt,
          ),
        ).toBeLessThanOrEqual(Date.now());
      } finally {
        appModule.runDispatcherTick = originalRunDispatcherTick;
      }
    });

    test("an empty repoRequests array falls through to the existing all-repos default path", async () => {
      const scriptCalls = [];
      appModule.runViewPrsScript = async (commandArgs) => {
        scriptCalls.push(commandArgs);
        return { stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }), stderr: "" };
      };

      await withAutoRepos("owner/repo-default", async () => {
        await runViewPrsQuickCheck({ repoRequests: [] });
      });

      expect(scriptCalls).toHaveLength(1);
      expect(scriptCalls[0]).toEqual(expect.arrayContaining(["--repo", "owner/repo-default"]));
      expect(scriptCalls[0]).not.toContain("--quick-check-numbers");
    });

    test("checks the free repo and skips only the one whose auto refresh is in progress, instead of blocking the whole call", async () => {
      viewPrsSchedulerState.autoRefreshInProgressRepos = new Set(["owner/repo-busy"]);
      const scriptCalls = [];
      appModule.runViewPrsScript = async (commandArgs) => {
        scriptCalls.push(commandArgs);
        return { stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }), stderr: "" };
      };

      const result = await runViewPrsQuickCheck({
        repoRequests: [{ repo: "owner/repo-busy" }, { repo: "owner/repo-free" }],
      });

      // Only the free repo's script call actually happened.
      expect(scriptCalls).toHaveLength(1);
      expect(scriptCalls[0]).toEqual(expect.arrayContaining(["--repo", "owner/repo-free"]));
      expect(result.skipped).toBe(false);
      expect(result.reposChecked).toEqual(["owner/repo-free"]);
      expect(result.reposSkippedForAutoRefresh).toEqual(["owner/repo-busy"]);
      expect(viewPrsSchedulerState.quickCheckSkippedRepos.has("owner/repo-busy")).toBe(true);
      expect(viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress).toBe(true);
    });

    test("checks the free repo and skips only the one a DIFFERENT concurrent quick check call is already covering", async () => {
      viewPrsSchedulerState.quickCheckInProgressRepos = new Set(["owner/repo-busy-qc"]);
      const scriptCalls = [];
      appModule.runViewPrsScript = async (commandArgs) => {
        scriptCalls.push(commandArgs);
        return { stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }), stderr: "" };
      };

      const result = await runViewPrsQuickCheck({
        repoRequests: [{ repo: "owner/repo-busy-qc" }, { repo: "owner/repo-free-qc" }],
      });

      // Only the free repo's script call actually happened.
      expect(scriptCalls).toHaveLength(1);
      expect(scriptCalls[0]).toEqual(expect.arrayContaining(["--repo", "owner/repo-free-qc"]));
      expect(result.skipped).toBe(false);
      expect(result.reposChecked).toEqual(["owner/repo-free-qc"]);
      expect(result.reposSkippedForQuickCheckInProgress).toEqual(["owner/repo-busy-qc"]);
      // No catch-up is armed for this reason, unlike the auto-refresh-overlap
      // case above (a quick-check-vs-quick-check collision is short-lived
      // and self-resolves - see reposBusyWithAutoRefresh's own comment).
      expect(viewPrsSchedulerState.quickCheckSkippedWhileAutoRunInProgress).toBe(false);
      expect(viewPrsSchedulerState.quickCheckSkippedRepos.size).toBe(0);
    });

    test("checks the free repo and skips only the one whose own circuit breaker is open", async () => {
      viewPrsSchedulerState.autoCircuitByRepo["owner/repo-cb-open-qc"] = {
        consecutiveFailures: 3,
        circuitOpenUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        lastCircuitOpenedAt: new Date().toISOString(),
      };
      const scriptCalls = [];
      appModule.runViewPrsScript = async (commandArgs) => {
        scriptCalls.push(commandArgs);
        return { stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }), stderr: "" };
      };

      const result = await runViewPrsQuickCheck({
        repoRequests: [{ repo: "owner/repo-cb-open-qc" }, { repo: "owner/repo-cb-free-qc" }],
      });

      expect(scriptCalls).toHaveLength(1);
      expect(scriptCalls[0]).toEqual(expect.arrayContaining(["--repo", "owner/repo-cb-free-qc"]));
      expect(result.skipped).toBe(false);
      expect(result.reposChecked).toEqual(["owner/repo-cb-free-qc"]);
      expect(result.reposSkippedForCircuitOpen).toEqual(["owner/repo-cb-open-qc"]);
    });
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
