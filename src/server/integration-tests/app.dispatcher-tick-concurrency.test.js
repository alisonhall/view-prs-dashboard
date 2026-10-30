// Regression tests for the dispatcher tick restructure: runDispatcherTick
// used to hold isDispatcherTickInFlight for the ENTIRE tick, including
// awaiting every selected task-type group's execution sequentially - so a
// slow, multi-repo autoRefresh group blocked the next periodic tick from
// even looking for newly-due work (like a different repo's quickCheck)
// until it finished. Now the only guarded "claim" phase is picking the
// batch and marking entries running (fully synchronous) - execution is
// kicked off fire-and-forget, so a later tick can claim and run a
// different, newly-due entry while an earlier tick's group is still
// executing in the background. See the plan this implements:
// "Let quick check run while auto refresh is already busy".
const fs = require("fs");
const appModule = require("../app.js");
const {
  viewPrsSchedulerState,
  viewPrsSchedulerFile,
  dispatcherHelpers,
  runDispatcherTick,
} = appModule;

// These tests chain several real setImmediate/setTimeout waits around real
// (mocked) async work - under the CPU contention of the full suite running
// across many parallel jest workers, the default 5000ms budget can be too
// tight even though nothing is actually hung (same pattern/reasoning as
// app.routes.test.js's own jest.setTimeout(20000) override).
jest.setTimeout(20000);

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
  try {
    fs.rmSync(viewPrsSchedulerFile, { force: true });
  } catch (_error) {
    // Best-effort.
  }
};

// Creates a promise this test controls the resolution of, standing in for
// a slow autoRefresh script call - lets the test assert on dispatcher state
// WHILE the call is still pending, then resolve it on demand.
const makeDeferred = () => {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("dispatcher tick concurrency (a newly-due task runs without waiting for a slower one already in flight)", () => {
  const savedRunViewPrsAutoRefresh = appModule.runViewPrsAutoRefresh;
  const savedRunViewPrsQuickCheck = appModule.runViewPrsQuickCheck;

  beforeEach(() => {
    resetState();
  });

  afterEach(() => {
    if (savedRunViewPrsAutoRefresh !== undefined) {
      appModule.runViewPrsAutoRefresh = savedRunViewPrsAutoRefresh;
    } else {
      delete appModule.runViewPrsAutoRefresh;
    }
    if (savedRunViewPrsQuickCheck !== undefined) {
      appModule.runViewPrsQuickCheck = savedRunViewPrsQuickCheck;
    } else {
      delete appModule.runViewPrsQuickCheck;
    }
    resetState();
  });

  test("a tick returns before a slow task group's own execution finishes", async () => {
    const deferred = makeDeferred();
    appModule.runViewPrsAutoRefresh = async () => deferred.promise;

    await withAutoRepos("owner/repo-slow", async () => {
      // A freshly-registered repo's quickCheck/mergedDrain entries are ALSO
      // immediately due (same as autoRefresh) - push them into the future
      // so this tick selects only autoRefresh, isolating what this test is
      // actually about instead of also hitting the real quickCheck/
      // mergedDrain paths (unmocked here).
      dispatcherHelpers.getOrInitRegistry();
      const entries = viewPrsSchedulerState.dispatcher.entries;
      const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      entries["owner/repo-slow::quickCheck"].nextDueAt = farFuture;
      entries["owner/repo-slow::mergedDrain"].nextDueAt = farFuture;

      await runDispatcherTick();
    });

    const entry = viewPrsSchedulerState.dispatcher.entries["owner/repo-slow::autoRefresh"];
    expect(entry.isRunning).toBe(true);

    deferred.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    expect(entry.isRunning).toBe(false);
  });

  test("a different repo's newly-due quick check runs via a later tick while an earlier tick's auto refresh is still executing", async () => {
    const autoRefreshDeferred = makeDeferred();
    appModule.runViewPrsAutoRefresh = async () => autoRefreshDeferred.promise;
    let quickCheckRunCount = 0;
    appModule.runViewPrsQuickCheck = async () => {
      quickCheckRunCount += 1;
      return { skipped: false, reposChecked: ["owner/repo-fast"], reposFailed: [] };
    };

    await withAutoRepos("owner/repo-slow,owner/repo-fast", async () => {
      // First tick: only owner/repo-slow's autoRefresh is due. Push every
      // other entry (including owner/repo-fast's quickCheck) out so this
      // tick selects exactly one thing.
      dispatcherHelpers.getOrInitRegistry();
      const entries = viewPrsSchedulerState.dispatcher.entries;
      const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      Object.values(entries).forEach((entry) => {
        entry.nextDueAt = farFuture;
      });
      entries["owner/repo-slow::autoRefresh"].nextDueAt = new Date().toISOString();

      await runDispatcherTick();
      expect(entries["owner/repo-slow::autoRefresh"].isRunning).toBe(true);
      expect(quickCheckRunCount).toBe(0);

      // Now owner/repo-fast's quick check becomes due, while the slow
      // autoRefresh above is STILL executing (its deferred promise hasn't
      // been resolved yet).
      entries["owner/repo-fast::quickCheck"].nextDueAt = new Date().toISOString();
      await runDispatcherTick();
      // Give the fire-and-forget quick check execution a turn to run.
      await new Promise((resolve) => setImmediate(resolve));

      expect(quickCheckRunCount).toBe(1);
      // The slow autoRefresh is still genuinely unfinished throughout.
      expect(entries["owner/repo-slow::autoRefresh"].isRunning).toBe(true);

      autoRefreshDeferred.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      expect(entries["owner/repo-slow::autoRefresh"].isRunning).toBe(false);
    });
  });

  // Regression test for a bug found during review of this same change:
  // runViewPrsMergedQueueDrain calls callRunViewPrsAutoRefresh INTERNALLY
  // (to refresh the repo(s) it just drained) - sharing runViewPrsAutoRefresh's
  // own single-flight isAutoRunInProgress guard, which stays global by
  // design (only the cross-task quickCheck-vs-autoRefresh guard became
  // per-repo - see autoRefreshInProgressRepos's own comment). If the
  // autoRefresh group (for a DIFFERENT repo) and the mergedDrain group were
  // both kicked off fire-and-forget independently in the same tick, one's
  // direct call and the other's internal call could race for that same
  // global guard, silently starving whichever lost. runDispatcherTick
  // sequences these two groups relative to each other (not to quickCheck,
  // and not blocking the tick's own return) specifically to prevent this.
  test("mergedDrain's own internal auto-refresh for its drained repo is not starved by a different repo's concurrently-selected autoRefresh group in the same tick", async () => {
    const scriptCallRepos = [];
    const deferredForRepoA = makeDeferred();
    appModule.runViewPrsScript = async (commandArgs) => {
      const repoIndex = commandArgs.indexOf("--repo");
      const repo = repoIndex >= 0 ? commandArgs[repoIndex + 1] : null;
      scriptCallRepos.push(repo);
      if (repo === "owner/repo-a") {
        await deferredForRepoA.promise;
      }
      return { stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }), stderr: "" };
    };
    viewPrsSchedulerState.pendingByRepo["owner/repo-b"] = {
      open: [],
      mergedClosed: ["501"],
    };

    await withAutoRepos("owner/repo-a,owner/repo-b", async () => {
      dispatcherHelpers.getOrInitRegistry();
      const entries = viewPrsSchedulerState.dispatcher.entries;
      const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      Object.values(entries).forEach((entry) => {
        entry.nextDueAt = farFuture;
      });
      // owner/repo-a's own autoRefresh, and owner/repo-b's mergedDrain
      // (which will internally call autoRefresh for owner/repo-b) - both
      // due in the SAME tick.
      entries["owner/repo-a::autoRefresh"].nextDueAt = new Date().toISOString();
      entries["owner/repo-b::mergedDrain"].nextDueAt = new Date().toISOString();

      await runDispatcherTick();
      // Give both groups' synchronous prefixes a turn to start.
      await new Promise((resolve) => setImmediate(resolve));

      // owner/repo-a's autoRefresh is genuinely still in flight (deferred).
      // mergedDrain's own group is sequenced to start only AFTER
      // autoRefresh's group fully finishes (not concurrently with it, and
      // not silently skipped either) - so owner/repo-b hasn't been called
      // yet at this point.
      expect(entries["owner/repo-a::autoRefresh"].isRunning).toBe(true);
      expect(scriptCallRepos).not.toContain("owner/repo-b");

      // Once owner/repo-a's autoRefresh finishes, mergedDrain's group (and
      // its own internal autoRefresh call for owner/repo-b) runs next -
      // the actual regression check: it eventually runs at all, rather
      // than being permanently starved by having raced owner/repo-a's
      // call for the shared isAutoRunInProgress guard and lost.
      deferredForRepoA.resolve();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(scriptCallRepos).toContain("owner/repo-b");
    });
  });
});

describe("dispatcher tick budget accounts for still-running entries from an earlier tick", () => {
  let freshAppModule;
  const originalBudgetEnv = process.env.VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET;

  beforeEach(() => {
    // The gh-process budget is read once at module load (see
    // app.dispatcher-budget-clamp.test.js's own comment) - set it low
    // enough that a still-running autoRefresh (cost 4) alone exhausts it,
    // then require a fresh app.js so this value actually takes effect.
    process.env.VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET = "4";
    jest.resetModules();
    freshAppModule = require("../app.js");
  });

  afterEach(() => {
    if (originalBudgetEnv === undefined) {
      delete process.env.VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET;
    } else {
      process.env.VIEW_PRS_DISPATCHER_GH_PROCESS_BUDGET = originalBudgetEnv;
    }
    try {
      fs.rmSync(freshAppModule.viewPrsSchedulerFile, { force: true });
    } catch (_error) {
      // Best-effort.
    }
  });

  test("a quick check that would fit the budget alone is NOT selected while a same-budget autoRefresh from an earlier tick is still running", async () => {
    const deferred = makeDeferred();
    freshAppModule.runViewPrsAutoRefresh = async () => deferred.promise;
    let quickCheckRunCount = 0;
    freshAppModule.runViewPrsQuickCheck = async () => {
      quickCheckRunCount += 1;
      return { skipped: false, reposChecked: [], reposFailed: [] };
    };

    await withAutoRepos("owner/repo-slow,owner/repo-fast", async () => {
      freshAppModule.dispatcherHelpers.getOrInitRegistry();
      const entries = freshAppModule.viewPrsSchedulerState.dispatcher.entries;
      const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      Object.values(entries).forEach((entry) => {
        entry.nextDueAt = farFuture;
      });
      entries["owner/repo-slow::autoRefresh"].nextDueAt = new Date().toISOString();

      await freshAppModule.runDispatcherTick();
      expect(entries["owner/repo-slow::autoRefresh"].isRunning).toBe(true);

      // Budget is 4; the still-running autoRefresh's own cost is already 4
      // (see dispatcherGhCostByTaskType in app.js), so getRunningGhCost()
      // leaves 0 slots - the quick check (cost 1) must wait, not run.
      entries["owner/repo-fast::quickCheck"].nextDueAt = new Date().toISOString();
      await freshAppModule.runDispatcherTick();
      await new Promise((resolve) => setImmediate(resolve));

      expect(quickCheckRunCount).toBe(0);
      expect(entries["owner/repo-fast::quickCheck"].isRunning).toBe(false);

      deferred.resolve();
      await new Promise((resolve) => setImmediate(resolve));
    });
  });
});

describe("dispatcher tick is circuit-breaker-aware (a circuit-open repo's entries are never selected)", () => {
  const savedRunViewPrsScript = appModule.runViewPrsScript;

  beforeEach(() => {
    resetState();
  });

  afterEach(() => {
    if (savedRunViewPrsScript !== undefined) {
      appModule.runViewPrsScript = savedRunViewPrsScript;
    } else {
      delete appModule.runViewPrsScript;
    }
    resetState();
  });

  test("a circuit-open repo's due autoRefresh entry is skipped by a real tick, while a different repo's due entry still runs", async () => {
    const scriptCallRepos = [];
    appModule.runViewPrsScript = async (commandArgs) => {
      const repoIndex = commandArgs.indexOf("--repo");
      scriptCallRepos.push(repoIndex >= 0 ? commandArgs[repoIndex + 1] : null);
      return { stdout: "", stderr: "" };
    };
    viewPrsSchedulerState.autoCircuitByRepo["owner/repo-broken"] = {
      consecutiveFailures: 3,
      circuitOpenUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      lastCircuitOpenedAt: new Date().toISOString(),
    };

    await withAutoRepos("owner/repo-broken,owner/repo-healthy", async () => {
      dispatcherHelpers.getOrInitRegistry();
      const entries = viewPrsSchedulerState.dispatcher.entries;
      const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      Object.values(entries).forEach((entry) => {
        entry.nextDueAt = farFuture;
      });
      entries["owner/repo-broken::autoRefresh"].nextDueAt = new Date().toISOString();
      entries["owner/repo-healthy::autoRefresh"].nextDueAt = new Date().toISOString();

      await runDispatcherTick();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      // owner/repo-broken was never selected at all - never claimed
      // (isRunning), never actually invoked the script.
      expect(entries["owner/repo-broken::autoRefresh"].isRunning).toBe(false);
      expect(scriptCallRepos).not.toContain("owner/repo-broken");
      // A genuinely due, unrelated repo still ran normally.
      expect(scriptCallRepos).toContain("owner/repo-healthy");

      const snapshot = dispatcherHelpers.getDispatcherQueueSnapshot({ limit: 20 });
      const brokenEntry = snapshot.find(
        (entry) => entry.repo === "owner/repo-broken" && entry.taskType === "autoRefresh",
      );
      expect(brokenEntry.status).toBe("circuit-open");
    });
  });
});

describe("a dispatcher-driven call that's merely skipped (not failed, not a genuine success) is deferred, not finished", () => {
  const savedRunViewPrsScript = appModule.runViewPrsScript;

  beforeEach(() => {
    resetState();
  });

  afterEach(() => {
    if (savedRunViewPrsScript !== undefined) {
      appModule.runViewPrsScript = savedRunViewPrsScript;
    } else {
      delete appModule.runViewPrsScript;
    }
    resetState();
  });

  test("an autoRefresh entry claimed by the tick, but blocked by an already-in-progress overlap, keeps its consecutiveFailureCount and gets a short retry - not the full interval", async () => {
    await withAutoRepos("owner/repo-busy", async () => {
      dispatcherHelpers.getOrInitRegistry();
      const entries = viewPrsSchedulerState.dispatcher.entries;
      const entry = entries["owner/repo-busy::autoRefresh"];
      entry.consecutiveFailureCount = 1;
      entry.nextDueAt = new Date().toISOString();

      // Simulate the repo already being mid-refresh via some OTHER path
      // (e.g. a manual route) so runViewPrsAutoRefresh's own
      // already-in-progress guard fires when the dispatcher calls it.
      viewPrsSchedulerState.autoRefreshInProgressRepos.add("owner/repo-busy");

      const beforeMs = Date.now();
      await runDispatcherTick();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(entry.isRunning).toBe(false);
      expect(entry.consecutiveFailureCount).toBe(1);
      expect(entry.lastSkipReason).toBe("already-in-progress");
      const nextDueMs = new Date(entry.nextDueAt).getTime();
      expect(nextDueMs).toBeGreaterThan(beforeMs);
      expect(nextDueMs).toBeLessThan(beforeMs + entry.intervalMs);
    });
  });

  test("a quickCheck entry claimed by the tick, but blocked by an already-in-progress overlap, keeps its consecutiveFailureCount and gets a short retry - not the full interval", async () => {
    await withAutoRepos("owner/repo-qc-busy", async () => {
      dispatcherHelpers.getOrInitRegistry();
      const entries = viewPrsSchedulerState.dispatcher.entries;
      // Only the quickCheck entry under test should be due this tick.
      const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      Object.values(entries).forEach((e) => {
        e.nextDueAt = farFuture;
      });
      const entry = entries["owner/repo-qc-busy::quickCheck"];
      entry.consecutiveFailureCount = 1;
      entry.nextDueAt = new Date().toISOString();

      // Simulate the repo already being mid-quick-check via some OTHER
      // path so runViewPrsQuickCheck's own already-in-progress guard fires
      // when the dispatcher calls it.
      viewPrsSchedulerState.quickCheckInProgressRepos.add("owner/repo-qc-busy");

      const beforeMs = Date.now();
      await runDispatcherTick();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(entry.isRunning).toBe(false);
      expect(entry.lastOk).not.toBe(true);
      expect(entry.consecutiveFailureCount).toBe(1);
      expect(entry.lastSkipReason).toBe("already-in-progress");
      const nextDueMs = new Date(entry.nextDueAt).getTime();
      expect(nextDueMs).toBeGreaterThan(beforeMs);
      expect(nextDueMs).toBeLessThan(beforeMs + entry.intervalMs);
    });
  });

  test("when a tick batches TWO repos' autoRefresh together and only one is blocked, the blocked one is deferred while the other is recorded as a genuine success - not both marked ok:true", async () => {
    appModule.runViewPrsScript = async () => ({ stdout: "", stderr: "" });
    await withAutoRepos("owner/repo-a,owner/repo-b", async () => {
      dispatcherHelpers.getOrInitRegistry();
      const entries = viewPrsSchedulerState.dispatcher.entries;
      const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      Object.values(entries).forEach((e) => {
        e.nextDueAt = farFuture;
      });
      const entryA = entries["owner/repo-a::autoRefresh"];
      const entryB = entries["owner/repo-b::autoRefresh"];
      entryA.consecutiveFailureCount = 2;
      entryA.nextDueAt = new Date().toISOString();
      entryB.nextDueAt = new Date().toISOString();
      const beforeMs = Date.now();

      // repo-a is mid-refresh via some OTHER concurrent path (e.g. a
      // manual "Run now" / POST /run-auto call) at the exact moment the
      // dispatcher's own tick batches repo-a and repo-b's due autoRefresh
      // entries together into ONE call.
      viewPrsSchedulerState.autoRefreshInProgressRepos.add("owner/repo-a");

      await runDispatcherTick();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      // repo-a never actually ran - must be deferred, not finished.
      expect(entryA.lastOk).not.toBe(true);
      expect(entryA.consecutiveFailureCount).toBe(2);
      expect(entryA.lastSkipReason).toBe("already-in-progress");
      const nextDueMsA = new Date(entryA.nextDueAt).getTime();
      expect(nextDueMsA).toBeLessThan(beforeMs + entryA.intervalMs);

      // repo-b genuinely ran and succeeded - must still get the normal
      // full-interval success treatment, unaffected by repo-a's own skip.
      expect(entryB.lastOk).toBe(true);
      const nextDueMsB = new Date(entryB.nextDueAt).getTime();
      expect(nextDueMsB).toBeGreaterThanOrEqual(beforeMs + entryB.intervalMs);
    });
  });

  test("when a tick batches TWO repos' quickCheck together and only one is blocked, the blocked one is deferred while the other is recorded as a genuine success", async () => {
    appModule.runViewPrsScript = async () => ({
      stdout: JSON.stringify({ pendingOpen: [], pendingMergedClosed: [] }),
      stderr: "",
    });
    await withAutoRepos("owner/repo-qc-a,owner/repo-qc-b", async () => {
      dispatcherHelpers.getOrInitRegistry();
      const entries = viewPrsSchedulerState.dispatcher.entries;
      const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      Object.values(entries).forEach((e) => {
        e.nextDueAt = farFuture;
      });
      const entryA = entries["owner/repo-qc-a::quickCheck"];
      const entryB = entries["owner/repo-qc-b::quickCheck"];
      entryA.consecutiveFailureCount = 2;
      entryA.nextDueAt = new Date().toISOString();
      entryB.nextDueAt = new Date().toISOString();
      const beforeMs = Date.now();

      // repo-qc-a is mid-quick-check via some OTHER concurrent path at the
      // exact moment the dispatcher's own tick batches both repos' due
      // quickCheck entries together into ONE call.
      viewPrsSchedulerState.quickCheckInProgressRepos.add("owner/repo-qc-a");

      await runDispatcherTick();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(entryA.lastOk).not.toBe(true);
      expect(entryA.consecutiveFailureCount).toBe(2);
      expect(entryA.lastSkipReason).toBe("already-in-progress");
      const nextDueMsA = new Date(entryA.nextDueAt).getTime();
      expect(nextDueMsA).toBeLessThan(beforeMs + entryA.intervalMs);

      expect(entryB.lastOk).toBe(true);
      const nextDueMsB = new Date(entryB.nextDueAt).getTime();
      expect(nextDueMsB).toBeGreaterThanOrEqual(beforeMs + entryB.intervalMs);
    });
  });

  test("a mergedDrain tick with nothing actually pending to drain is recorded as a genuine success, not a failure", async () => {
    // runViewPrsMergedQueueDrain's own "nothing-pending" path returns no
    // result object at all (a routine "checked, found nothing to do" -
    // deliberately not a skip) - runTaskGroup's resultsByRepo must default
    // an unaccounted-for repo to a success, not fall through to
    // executeTaskTypeGroup's "no per-repo result reported" failure
    // fallback, which is meant for a genuinely unexpected gap only.
    appModule.runViewPrsScript = async () => ({ stdout: "", stderr: "" });
    await withAutoRepos("owner/repo-nothing-pending", async () => {
      dispatcherHelpers.getOrInitRegistry();
      const entries = viewPrsSchedulerState.dispatcher.entries;
      const farFuture = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      Object.values(entries).forEach((e) => {
        e.nextDueAt = farFuture;
      });
      const entry = entries["owner/repo-nothing-pending::mergedDrain"];
      entry.consecutiveFailureCount = 0;
      entry.nextDueAt = new Date().toISOString();

      viewPrsSchedulerState.pendingByRepo = {};

      await runDispatcherTick();
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(entry.lastOk).toBe(true);
      expect(entry.lastError).toBeNull();
      expect(entry.consecutiveFailureCount).toBe(0);
    });
  });
});
