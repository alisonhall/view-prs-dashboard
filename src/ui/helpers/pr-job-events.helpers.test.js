const { createPrJobEventsHelpers } = require("./pr-job-events.helpers.js");

describe("pr job events helpers", () => {
  const FIXED_NOW = "2026-01-01T00:00:00.000Z";
  const { getInitialJobEventsState, applyJobEventsSnapshot, applyJobEvent, setConnectionState } =
    createPrJobEventsHelpers({ now: () => FIXED_NOW });

  describe("getInitialJobEventsState", () => {
    test("starts idle with no waitingOn, zero pending counts, and an empty recentFinished list", () => {
      const state = getInitialJobEventsState();
      expect(state.connection).toBe("connecting");
      expect(state.jobs.autoRefresh.status).toBe("idle");
      expect(state.jobs.quickCheck.waitingOn).toBeNull();
      expect(state.pendingOpenCount).toBe(0);
      expect(state.pendingMergedClosedCount).toBe(0);
      expect(state.recentFinished).toEqual([]);
      expect(state.dispatcherQueue).toEqual([]);
      expect(state.openAutoCircuitRepos).toEqual([]);
      expect(state.schedulerSummary).toEqual({
        intervalMinutes: 15,
        manualCooldownMinutes: 15,
        lastManualRunAt: null,
        lastAutoRunAt: null,
        lastAutoSkipReason: null,
        lastAutoError: null,
      });
    });
  });

  describe("applyJobEventsSnapshot", () => {
    test("seeds job statuses from the scheduler payload and marks the connection open", () => {
      const state = applyJobEventsSnapshot(getInitialJobEventsState(), {
        at: FIXED_NOW,
        scheduler: {
          isAutoRunInProgress: true,
          isQuickCheckInProgress: false,
          isMergedDrainInProgress: false,
          quickCheckSkippedWhileAutoRunInProgress: true,
        },
      });

      expect(state.connection).toBe("open");
      expect(state.jobs.autoRefresh.status).toBe("running");
      expect(state.jobs.quickCheck.waitingOn).toEqual({ job: "autoRefresh", since: FIXED_NOW });
    });

    test("carries pendingOpenCount/pendingMergedClosedCount from the scheduler payload", () => {
      const state = applyJobEventsSnapshot(getInitialJobEventsState(), {
        at: FIXED_NOW,
        scheduler: { pendingOpenCount: 3, pendingMergedClosedCount: 2 },
      });

      expect(state.pendingOpenCount).toBe(3);
      expect(state.pendingMergedClosedCount).toBe(2);
    });

    test("carries dispatcherQueue from the scheduler payload, or defaults to empty if absent/malformed", () => {
      const withQueue = applyJobEventsSnapshot(getInitialJobEventsState(), {
        at: FIXED_NOW,
        scheduler: {
          dispatcherQueue: [{ repo: "owner/repo", taskType: "autoRefresh", status: "running" }],
        },
      });
      expect(withQueue.dispatcherQueue).toEqual([
        { repo: "owner/repo", taskType: "autoRefresh", status: "running" },
      ]);

      const withoutQueue = applyJobEventsSnapshot(getInitialJobEventsState(), {
        at: FIXED_NOW,
        scheduler: { dispatcherQueue: "not-an-array" },
      });
      expect(withoutQueue.dispatcherQueue).toEqual([]);
    });

    test("carries openAutoCircuitRepos from the scheduler payload, or defaults to empty if absent/malformed", () => {
      const withRepos = applyJobEventsSnapshot(getInitialJobEventsState(), {
        at: FIXED_NOW,
        scheduler: { openAutoCircuitRepos: ["owner/repo-a"] },
      });
      expect(withRepos.openAutoCircuitRepos).toEqual(["owner/repo-a"]);

      const withoutRepos = applyJobEventsSnapshot(getInitialJobEventsState(), {
        at: FIXED_NOW,
        scheduler: { openAutoCircuitRepos: "not-an-array" },
      });
      expect(withoutRepos.openAutoCircuitRepos).toEqual([]);
    });

    test("carries the scheduler-summary fields (intervalMinutes/manualCooldownMinutes/lastManualRunAt/lastAutoRunAt/lastAutoSkipReason/lastAutoError) from the scheduler payload", () => {
      const state = applyJobEventsSnapshot(getInitialJobEventsState(), {
        at: FIXED_NOW,
        scheduler: {
          intervalMinutes: 30,
          manualCooldownMinutes: 10,
          lastManualRunAt: "2026-01-01T00:00:00.000Z",
          lastAutoRunAt: "2026-01-01T00:05:00.000Z",
          lastAutoSkipReason: "circuit open",
          lastAutoError: "boom",
        },
      });

      expect(state.schedulerSummary).toEqual({
        intervalMinutes: 30,
        manualCooldownMinutes: 10,
        lastManualRunAt: "2026-01-01T00:00:00.000Z",
        lastAutoRunAt: "2026-01-01T00:05:00.000Z",
        lastAutoSkipReason: "circuit open",
        lastAutoError: "boom",
      });
    });

    test("given a scheduler payload missing the summary fields, when applied, then the previous schedulerSummary is preserved field by field, not reset to defaults", () => {
      const seeded = applyJobEventsSnapshot(getInitialJobEventsState(), {
        at: FIXED_NOW,
        scheduler: { lastAutoRunAt: "2026-01-01T00:05:00.000Z" },
      });

      const next = applyJobEventsSnapshot(seeded, {
        at: FIXED_NOW,
        scheduler: { intervalMinutes: 45 },
      });

      expect(next.schedulerSummary.lastAutoRunAt).toBe("2026-01-01T00:05:00.000Z");
      expect(next.schedulerSummary.intervalMinutes).toBe(45);
    });

    test("is authoritative regardless of lastSeq, and resets lastSeq to 0", () => {
      const midStream = { ...getInitialJobEventsState(), lastSeq: 42 };

      const state = applyJobEventsSnapshot(midStream, {
        at: FIXED_NOW,
        scheduler: { isAutoRunInProgress: false },
      });

      expect(state.lastSeq).toBe(0);
    });
  });

  describe("applyJobEvent - skipped vs deferred (the honesty contract)", () => {
    test("a skipped event records lastSkip but does not change status", () => {
      const state = applyJobEvent(getInitialJobEventsState(), {
        job: "quickCheck",
        phase: "skipped",
        seq: 1,
        at: FIXED_NOW,
        detail: { reason: "already-in-progress", willRunAfter: false },
      });

      expect(state.jobs.quickCheck.status).toBe("idle");
      expect(state.jobs.quickCheck.lastSkip).toEqual({ reason: "already-in-progress", at: FIXED_NOW });
      expect(state.jobs.quickCheck.waitingOn).toBeNull();
    });

    test("a deferred event sets waitingOn without touching status", () => {
      const state = applyJobEvent(getInitialJobEventsState(), {
        job: "quickCheck",
        phase: "deferred",
        seq: 1,
        at: FIXED_NOW,
        detail: { waitingOn: "autoRefresh", willRunAfter: true },
      });

      expect(state.jobs.quickCheck.status).toBe("idle");
      expect(state.jobs.quickCheck.waitingOn).toEqual({ job: "autoRefresh", since: FIXED_NOW });
    });

    test("any subsequent non-deferred quickCheck event clears waitingOn", () => {
      const deferred = applyJobEvent(getInitialJobEventsState(), {
        job: "quickCheck",
        phase: "deferred",
        seq: 1,
        at: FIXED_NOW,
        detail: { waitingOn: "autoRefresh" },
      });

      const started = applyJobEvent(deferred, {
        job: "quickCheck",
        phase: "start",
        seq: 2,
        at: FIXED_NOW,
      });

      expect(started.jobs.quickCheck.waitingOn).toBeNull();
    });
  });

  describe("applyJobEvent - start/finish lifecycle", () => {
    test("start marks the job running", () => {
      const state = applyJobEvent(getInitialJobEventsState(), {
        job: "autoRefresh",
        phase: "start",
        seq: 1,
        at: FIXED_NOW,
      });

      expect(state.jobs.autoRefresh.status).toBe("running");
      expect(state.jobs.autoRefresh.startedAt).toBe(FIXED_NOW);
    });

    test("finish marks the job idle, records ok/error, and is tolerated without a prior start", () => {
      const state = applyJobEvent(getInitialJobEventsState(), {
        job: "autoRefresh",
        phase: "finish",
        seq: 1,
        at: FIXED_NOW,
        ok: true,
        detail: { error: null },
      });

      expect(state.jobs.autoRefresh.status).toBe("idle");
      expect(state.jobs.autoRefresh.lastOk).toBe(true);
    });

    test("finish appends to recentFinished, capped at 10 entries", () => {
      let state = getInitialJobEventsState();
      for (let i = 1; i <= 12; i += 1) {
        state = applyJobEvent(state, {
          job: "autoRefresh",
          phase: "finish",
          seq: i,
          at: FIXED_NOW,
          ok: true,
        });
      }

      expect(state.recentFinished).toHaveLength(10);
    });
  });

  describe("applyJobEvent - dedupe and job-agnostic frames", () => {
    test("ignores a job event whose seq is not greater than lastSeq", () => {
      const first = applyJobEvent(getInitialJobEventsState(), {
        job: "autoRefresh",
        phase: "start",
        seq: 5,
        at: FIXED_NOW,
      });

      const stale = applyJobEvent(first, {
        job: "autoRefresh",
        phase: "finish",
        seq: 3,
        at: FIXED_NOW,
        ok: true,
      });

      expect(stale.jobs.autoRefresh.status).toBe("running");
      expect(stale).toBe(first);
    });

    test("a job-agnostic scheduler-type envelope (no job field) only bumps lastEventAt/lastSeq/pendingCounts, not jobs", () => {
      const initial = getInitialJobEventsState();

      const state = applyJobEvent(initial, {
        seq: 1,
        at: FIXED_NOW,
        scheduler: { pendingOpenCount: 4, pendingMergedClosedCount: 1 },
      });

      expect(state.lastSeq).toBe(1);
      expect(state.jobs).toBe(initial.jobs);
      expect(state.pendingOpenCount).toBe(4);
      expect(state.pendingMergedClosedCount).toBe(1);
    });

    test("a job envelope also refreshes pendingOpenCount/pendingMergedClosedCount from its own bundled scheduler object", () => {
      const initial = getInitialJobEventsState();

      const state = applyJobEvent(initial, {
        job: "mergedQueueDrain",
        phase: "finish",
        seq: 1,
        at: FIXED_NOW,
        ok: true,
        scheduler: { pendingOpenCount: 0, pendingMergedClosedCount: 5 },
      });

      expect(state.pendingOpenCount).toBe(0);
      expect(state.pendingMergedClosedCount).toBe(5);
    });

    test("a job-agnostic scheduler-type envelope also refreshes dispatcherQueue from its own bundled scheduler object", () => {
      const initial = getInitialJobEventsState();

      const state = applyJobEvent(initial, {
        seq: 1,
        at: FIXED_NOW,
        scheduler: { dispatcherQueue: [{ repo: "owner/repo", taskType: "quickCheck", status: "due" }] },
      });

      expect(state.dispatcherQueue).toEqual([
        { repo: "owner/repo", taskType: "quickCheck", status: "due" },
      ]);
    });

    test("a job envelope also refreshes dispatcherQueue from its own bundled scheduler object", () => {
      const initial = getInitialJobEventsState();

      const state = applyJobEvent(initial, {
        job: "mergedQueueDrain",
        phase: "finish",
        seq: 1,
        at: FIXED_NOW,
        ok: true,
        scheduler: { dispatcherQueue: [{ repo: "owner/repo", taskType: "mergedDrain", status: "running" }] },
      });

      expect(state.dispatcherQueue).toEqual([
        { repo: "owner/repo", taskType: "mergedDrain", status: "running" },
      ]);
    });

    test("a job-agnostic scheduler-type envelope also refreshes openAutoCircuitRepos from its own bundled scheduler object", () => {
      const initial = getInitialJobEventsState();

      const state = applyJobEvent(initial, {
        seq: 1,
        at: FIXED_NOW,
        scheduler: { openAutoCircuitRepos: ["owner/repo-a"] },
      });

      expect(state.openAutoCircuitRepos).toEqual(["owner/repo-a"]);
    });

    test("a job envelope also refreshes openAutoCircuitRepos from its own bundled scheduler object", () => {
      const initial = getInitialJobEventsState();

      const state = applyJobEvent(initial, {
        job: "mergedQueueDrain",
        phase: "finish",
        seq: 1,
        at: FIXED_NOW,
        ok: true,
        scheduler: { openAutoCircuitRepos: ["owner/repo-b"] },
      });

      expect(state.openAutoCircuitRepos).toEqual(["owner/repo-b"]);
    });

    test("a job-agnostic scheduler-type envelope also refreshes schedulerSummary from its own bundled scheduler object", () => {
      const initial = getInitialJobEventsState();

      const state = applyJobEvent(initial, {
        seq: 1,
        at: FIXED_NOW,
        scheduler: { lastAutoRunAt: "2026-01-01T00:05:00.000Z", intervalMinutes: 30 },
      });

      expect(state.schedulerSummary.lastAutoRunAt).toBe("2026-01-01T00:05:00.000Z");
      expect(state.schedulerSummary.intervalMinutes).toBe(30);
    });

    test("a job envelope also refreshes schedulerSummary from its own bundled scheduler object", () => {
      const initial = getInitialJobEventsState();

      const state = applyJobEvent(initial, {
        job: "autoRefresh",
        phase: "finish",
        seq: 1,
        at: FIXED_NOW,
        ok: false,
        detail: { error: "boom" },
        scheduler: { lastAutoError: "boom", lastAutoSkipReason: null },
      });

      expect(state.schedulerSummary.lastAutoError).toBe("boom");
      expect(state.schedulerSummary.lastAutoSkipReason).toBeNull();
    });

    test("returns the same state reference for a malformed envelope", () => {
      const initial = getInitialJobEventsState();
      expect(applyJobEvent(initial, null)).toBe(initial);
      expect(applyJobEvent(initial, "not-an-object")).toBe(initial);
    });
  });

  describe("setConnectionState", () => {
    test("updates only the connection field", () => {
      const state = setConnectionState(getInitialJobEventsState(), "offline");
      expect(state.connection).toBe("offline");
    });
  });
});
