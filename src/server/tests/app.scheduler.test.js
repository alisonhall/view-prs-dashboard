const appModule = require("../app.js");
const {
  parseTimestamp,
  getManualCooldownSkipReason,
  getViewPrsAutoRefreshRepos,
  getViewPrsAutoCircuitOpenState,
  buildAckRefreshBudgetSkipErrors,
  runViewPrsAutoRefresh,
  resetViewPrsAutoRefreshFailureState,
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
    test("includes configured repos, stored repos, default repo, and last-run repo without duplicates", () => {
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

      expect(result).toEqual([
        "owner/four",
        "owner/two",
        "owner/one",
        "optum-rx-clinicalproducts/orx-cpp-mp-uis",
        "owner/three",
      ]);
    });

    test("given placeholder owner/repo values, when building auto-refresh repos, then excludes placeholder entries", () => {
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

      expect(result).toEqual([
        "owner/extra-repo",
        "owner/real-repo",
        "optum-rx-clinicalproducts/orx-cpp-mp-uis",
      ]);
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
    appModule.readViewPrsData = () => ({
      byPrNumber: {
        1: { repo: "owner/repo", section: "merged", prNumber: "1", data: { mergedAt: "2026-05-29T10:00:00Z" } },
        2: { repo: "owner/repo", section: "open", prNumber: "2", data: { mergedAt: "" } },
        3: { repo: "owner/repo", section: "merged", prNumber: "3", data: { mergedAt: "2026-05-29T11:00:00Z" } },
        4: { repo: "owner/repo", section: "draft", prNumber: "4", data: { mergedAt: "" } },
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

  test("sets lastAutoRunAt when runViewPrsAutoRefresh finishes successfully", async () => {
    const beforeRun = Date.now();

    await runViewPrsAutoRefresh({ skipCooldownChecks: true });

    expect(viewPrsSchedulerState.lastAutoRunAt).toBeTruthy();
    expect(
      Date.parse(viewPrsSchedulerState.lastAutoRunAt),
    ).toBeGreaterThanOrEqual(beforeRun);
  });

  test("seeds only the latest merged PRs before auto refresh starts", async () => {
    appModule.runViewPrsScript = async () => {
      expect(viewPrsSchedulerState.activePrNumbers).toEqual(["3", "1"]);
      return { stdout: "", stderr: "" };
    };

    await runViewPrsAutoRefresh({ skipCooldownChecks: true });

    expect(viewPrsSchedulerState.activePrNumbers).toEqual([]);
    expect(viewPrsSchedulerState.isAutoRunInProgress).toBe(false);
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
