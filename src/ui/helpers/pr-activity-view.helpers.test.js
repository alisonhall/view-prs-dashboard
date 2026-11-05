const {
  buildActivityFinished,
  buildActivityNow,
  buildActivityProblems,
  buildActivityUpNext,
  formatDuration,
} = require("./pr-activity-view.helpers.ts");
const { createPrJobEventsHelpers } = require("./pr-job-events.helpers.ts");

const NOW = Date.parse("2026-11-05T12:00:00Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const { getInitialJobEventsState, applyJobEvent, applyJobEventsSnapshot } = createPrJobEventsHelpers();

describe("formatDuration", () => {
  test("seconds, then minutes, then hours and minutes", () => {
    expect(formatDuration(40_000)).toBe("40s");
    expect(formatDuration(6 * 60_000 + 59_000)).toBe("6m");
    expect(formatDuration(65 * 60_000)).toBe("1h 5m");
    expect(formatDuration(2 * 3_600_000)).toBe("2h");
    expect(formatDuration(-5)).toBe("0s");
  });
});

describe("buildActivityProblems", () => {
  const base = { openAutoCircuitRepos: [], connection: "open", isStale: false, backfillStatusError: false };

  test("none when all is well", () => {
    expect(buildActivityProblems(base)).toEqual([]);
  });

  test("paused repos (resettable), lost or stale live updates, and backfill status", () => {
    expect(buildActivityProblems({ ...base, openAutoCircuitRepos: ["acme/api", "acme/web"], connection: "offline", backfillStatusError: true })).toEqual([
      { key: "circuit", text: expect.stringContaining("acme/api, acme/web"), canReset: true },
      { key: "connection", text: "Live updates disconnected - retrying…" },
      { key: "backfill", text: "Backfill status couldn't be read." },
    ]);
    expect(buildActivityProblems({ ...base, isStale: true })).toEqual([{ key: "connection", text: expect.stringContaining("stale") }]);
    // Still connecting on open isn't a problem.
    expect(buildActivityProblems({ ...base, connection: "connecting" })).toEqual([]);
  });
});

describe("buildActivityNow", () => {
  const jobs = getInitialJobEventsState().jobs;
  const request = (key, label, startedMsAgo, count = 1) => ({
    key,
    label,
    count,
    startedAtMs: NOW - startedMsAgo,
    thresholds: { warnMs: 120_000, criticalMs: 360_000 },
  });

  test("running jobs with their repos, your requests (slow ones flagged), unfinished bulk batches and backfill", () => {
    const items = buildActivityNow({
      jobs: {
        ...jobs,
        autoRefresh: { ...jobs.autoRefresh, status: "running", startedAt: ago(40_000), runningDetail: { repos: ["a/1", "a/2", "a/3"] } },
        quickCheck: { ...jobs.quickCheck, status: "running", startedAt: ago(5_000) },
      },
      activeRequests: [request("runScript", "Run script", 3 * 60_000, 2), request("notesSave", "Notes save", 7 * 60_000)],
      bulkBatches: [
        { batchId: "b1", actionLabel: "Bulk Ack", totalChunks: 4, doneCount: 1, failedCount: 1 },
        { batchId: "b2", actionLabel: "Done", totalChunks: 1, doneCount: 1, failedCount: 0 },
      ],
      isBackfillRunning: true,
      nowMs: NOW,
    });
    expect(items.map(({ label, detail, origin, elapsed, severity }) => [label, detail, origin, elapsed, severity])).toEqual([
      ["Full refresh", "3 repos", "background", "40s", ""],
      ["Quick check", "", "background", "5s", ""],
      ["Run script", "2 at once", "you", "3m", "warning"],
      ["Notes save", "", "you", "7m", "critical"],
      ["Bulk Ack", "chunk 3 of 4, 1 failed", "you", "", "warning"],
      ["Backfill", "", "background", "", ""],
    ]);
  });

  test("nothing running: an empty list", () => {
    expect(buildActivityNow({ jobs, activeRequests: [], bulkBatches: [], isBackfillRunning: false, nowMs: NOW })).toEqual([]);
  });
});

describe("buildActivityUpNext", () => {
  test("Quick check waiting first, then the queue in its order (not running or paused entries), then what's queued for the drain", () => {
    const items = buildActivityUpNext({
      dispatcherQueue: [
        { repo: "acme/api", taskType: "autoRefresh", status: "running" },
        { repo: "acme/api", taskType: "quickCheck", status: "due", priority: 5 },
        { repo: "acme/old", taskType: "autoRefresh", status: "circuit-open" },
        { repo: "acme/web", taskType: "mergedDrain", status: "scheduled", priority: 1, nextDueAt: new Date(NOW + 90_000).toISOString() },
        // Its time passed since the snapshot: due.
        { repo: "acme/web", taskType: "autoRefresh", status: "scheduled", priority: 3, nextDueAt: ago(1_000) },
      ],
      quickCheckWaitingOn: "autoRefresh",
      pendingOpenCount: 3,
      pendingMergedClosedCount: 2,
      nowMs: NOW,
    });
    expect(items.map(({ label, detail, when, canRunNow }) => [label, detail, when, Boolean(canRunNow)])).toEqual([
      ["Quick check", "waiting for a refresh of the repo to finish", "next", false],
      ["Quick check", "acme/api", "due now", false],
      ["Merged/closed drain", "acme/web", "in 1m", true],
      ["Full refresh", "acme/web", "due now", true],
      ["Queued for the drain", expect.stringContaining("3 open, 2 merged/closed"), "", false],
    ]);
  });
});

describe("buildActivityFinished", () => {
  test("jobs and your requests together, newest first, with a failed job's error and a skipped run's reason; at most 8", () => {
    const jobs = getInitialJobEventsState().jobs;
    const items = buildActivityFinished({
      jobs: { ...jobs, quickCheck: { ...jobs.quickCheck, lastSkip: { reason: "auto refresh in progress", at: ago(3 * 60_000) } } },
      recentFinished: [
        { job: "quickCheck", at: ago(60_000), ok: true, detail: { reposCheckedCount: 1 } },
        { job: "autoRefresh", at: ago(9 * 60_000), ok: false, detail: { repos: ["acme/api"], error: { message: "gh auth expired" } } },
        // The drain, by its refresh's entry (its own finish isn't listed).
        { job: "mergedQueueDrain", at: ago(30 * 60_000), ok: null, detail: { repos: ["acme/api", "acme/web"] } },
        { job: "autoRefresh", at: ago(30 * 60_000), ok: true, detail: { kind: "mergedQueueDrain", repos: ["acme/api", "acme/web"] } },
      ],
      recentRequestActivity: [
        { key: "ackClear", label: "Ack/Clear", finishedAt: ago(10_000) },
        // The page's own data loads aren't listed.
        { key: "dataLoad", label: "Data refresh", finishedAt: ago(5_000) },
      ],
      nowMs: NOW,
    });
    expect(items.map(({ label, detail, outcome, ago: when }) => [label, detail, outcome, when])).toEqual([
      ["Ack/Clear", "", "done", "just now"],
      ["Quick check", "1 repo", "ok", "1m ago"],
      ["Quick check", "skipped: auto refresh in progress", "skipped", "3m ago"],
      ["Full refresh", "gh auth expired", "failed", "9m ago"],
      ["Merged/closed drain", "acme/api, acme/web", "ok", "30m ago"],
    ]);

    const many = Array.from({ length: 12 }, (_, index) => ({ key: "notesSave", label: "Notes save", finishedAt: ago(index * 1000) }));
    expect(buildActivityFinished({ recentFinished: [], recentRequestActivity: many, nowMs: NOW })).toHaveLength(8);
  });
});

describe("a running job's repos (job events)", () => {
  test("kept from its start event while it runs; gone when it finishes, or a snapshot says it's idle", () => {
    let state = applyJobEvent(getInitialJobEventsState(), { seq: 1, job: "autoRefresh", phase: "start", detail: { repos: ["acme/api"] } });
    expect(state.jobs.autoRefresh.runningDetail).toEqual({ repos: ["acme/api"] });
    state = applyJobEvent(state, { seq: 2, job: "autoRefresh", phase: "finish", ok: true, detail: {} });
    expect(state.jobs.autoRefresh.runningDetail).toBeNull();

    state = applyJobEvent(state, { seq: 3, job: "autoRefresh", phase: "start", detail: { repos: ["acme/web"] } });
    state = applyJobEventsSnapshot(state, { scheduler: { isAutoRunInProgress: false } });
    expect(state.jobs.autoRefresh.runningDetail).toBeNull();
  });

  test("a reconnect finding a job running that wasn't: its start (and repos) unknown, not an earlier run's", () => {
    let state = applyJobEvent(getInitialJobEventsState(), { seq: 1, at: "2026-11-05T09:00:00Z", job: "quickCheck", phase: "start" });
    state = applyJobEvent(state, { seq: 2, job: "quickCheck", phase: "finish", ok: true });
    expect(state.jobs.quickCheck.startedAt).toBe("2026-11-05T09:00:00Z");
    state = applyJobEventsSnapshot(state, { scheduler: { isQuickCheckInProgress: true } });
    expect(state.jobs.quickCheck).toEqual(expect.objectContaining({ status: "running", startedAt: null, runningDetail: null }));

    // Still running at the next reconnect: what was known stays.
    let running = applyJobEvent(getInitialJobEventsState(), { seq: 1, at: "2026-11-05T11:00:00Z", job: "autoRefresh", phase: "start", detail: { repos: ["acme/api"] } });
    running = applyJobEventsSnapshot(running, { scheduler: { isAutoRunInProgress: true } });
    expect(running.jobs.autoRefresh).toEqual(expect.objectContaining({ startedAt: "2026-11-05T11:00:00Z", runningDetail: { repos: ["acme/api"] } }));
  });
});

describe("the server's tasks, with progress", () => {
  const { describeProgress, countActivity } = require("./pr-activity-view.helpers.ts");
  const jobs = getInitialJobEventsState().jobs;
  const task = (overrides) => ({ id: "t1", kind: "autoRefresh", origin: "background", repos: ["acme/api"], unit: "PR", done: 0, total: null, startedAt: ago(30_000), ...overrides });
  const request = (key, label) => ({ key, label, count: 1, startedAtMs: NOW - 11 * 60_000, thresholds: { warnMs: 600_000, criticalMs: 1_200_000 } });

  test("describeProgress: done of how many, or how many so far; nothing for one of one or none yet", () => {
    expect(describeProgress({ done: 12, total: 30, unit: "PR" })).toBe("12 of 30 PRs");
    expect(describeProgress({ done: 1, total: 2, unit: "repo" })).toBe("1 of 2 repos");
    expect(describeProgress({ done: 3, total: null, unit: "PR" })).toBe("3 PRs so far");
    expect(describeProgress({ done: 1, total: null, unit: "PR" })).toBe("1 PR so far");
    expect(describeProgress({ done: 0, total: 1, unit: "PR" })).toBe("");
    expect(describeProgress({ done: 0, total: null, unit: "PR" })).toBe("");
    expect(describeProgress({ done: 31, total: 30, unit: "PR" })).toBe("30 of 30 PRs");
  });

  test("Now: each task with its repos and progress, in place of the running jobs; one someone started stands in for this tab's request of its kind", () => {
    const items = buildActivityNow({
      // A running job the tasks already show isn't listed again.
      jobs: { ...jobs, autoRefresh: { ...jobs.autoRefresh, status: "running", startedAt: ago(30_000) } },
      tasks: [
        task({ id: "a", done: 4, total: null }),
        task({ id: "b", kind: "olderMerged", origin: "you", repos: ["acme/web"], done: 12, total: 30, startedAt: ago(11 * 60_000) }),
      ],
      activeRequests: [request("olderMerged", "Fetch older merged PRs"), request("notesSave", "Notes save")],
      bulkBatches: [],
      isBackfillRunning: false,
      nowMs: NOW,
    });
    expect(items.map(({ label, detail, origin, elapsed, severity }) => [label, detail, origin, elapsed, severity])).toEqual([
      ["Full refresh", "acme/api · 4 PRs so far", "background", "30s", ""],
      // Its thresholds from this tab's request of its kind.
      ["Fetch older merged PRs", "acme/web · 12 of 30 PRs", "you", "11m", "warning"],
      ["Notes save", "", "you", "11m", "warning"],
    ]);
  });

  test("the button counts the tasks and the requests they don't show (from a server without tasks, the running jobs)", () => {
    const tasks = [task({ id: "a" }), task({ id: "b", kind: "olderMerged", origin: "you" })];
    const activeRequests = [request("olderMerged", "Fetch older merged PRs"), request("notesSave", "Notes save"), request("dataLoad", "Data refresh")];
    expect(countActivity({ jobs, tasks, activeRequests })).toBe(3);
    const running = { ...jobs, quickCheck: { ...jobs.quickCheck, status: "running" } };
    expect(countActivity({ jobs: running, tasks: null, activeRequests })).toBe(3);
  });

  test("carried by every live update; null from a server that doesn't send them", () => {
    const tasks = [task({})];
    let state = applyJobEventsSnapshot(getInitialJobEventsState(), { scheduler: { tasks } });
    expect(state.tasks).toEqual(tasks);
    state = applyJobEvent(state, { seq: 1, scheduler: { tasks: [] } });
    expect(state.tasks).toEqual([]);
    // A frame without scheduler state keeps them.
    state = applyJobEvent({ ...state, tasks }, { seq: 2, job: "quickCheck", phase: "start" });
    expect(state.tasks).toEqual(tasks);
    expect(applyJobEventsSnapshot(getInitialJobEventsState(), { scheduler: {} }).tasks).toBeNull();
  });
});

describe("Full refresh, and Update changed PRs", () => {
  const { describeActivityKind, ACTIVITY_KIND_GUIDE } = require("./pr-activity-view.helpers.ts");
  const jobs = getInitialJobEventsState().jobs;

  test("an auto refresh is named by what it is: in Now (a task, or a running job), Up next and Just finished", () => {
    expect(
      buildActivityNow({
        jobs,
        tasks: [{ id: "t", kind: "changedPrs", origin: "background", repos: ["acme/api"], unit: "PR", done: 1, total: 3, startedAt: ago(5_000) }],
        activeRequests: [],
        bulkBatches: [],
        isBackfillRunning: false,
        nowMs: NOW,
      }).map((item) => [item.label, item.kind]),
    ).toEqual([["Update changed PRs", "changedPrs"]]);
    expect(
      buildActivityNow({
        jobs: { ...jobs, autoRefresh: { ...jobs.autoRefresh, status: "running", runningDetail: { kind: "changedPrs" } } },
        activeRequests: [],
        bulkBatches: [],
        isBackfillRunning: false,
        nowMs: NOW,
      })[0].label,
    ).toBe("Update changed PRs");

    const upNext = buildActivityUpNext({
      dispatcherQueue: [
        { repo: "acme/api", taskType: "autoRefresh", status: "due", forChangedPrs: true },
        { repo: "acme/web", taskType: "autoRefresh", status: "due" },
      ],
      quickCheckWaitingOn: null,
      pendingOpenCount: 0,
      pendingMergedClosedCount: 0,
      nowMs: NOW,
    });
    expect(upNext.map((item) => item.label)).toEqual(["Update changed PRs", "Full refresh"]);

    const finished = buildActivityFinished({
      recentFinished: [
        { job: "autoRefresh", at: ago(60_000), ok: true, detail: { kind: "changedPrs", repos: ["acme/api"] } },
        // The drain once: its refresh's entry, with the result and error.
        { job: "mergedQueueDrain", at: ago(2 * 60_000), ok: null, detail: { repos: ["acme/web"] } },
        { job: "autoRefresh", at: ago(2 * 60_000), ok: false, detail: { kind: "mergedQueueDrain", repos: ["acme/web"], error: "gh auth expired" } },
        { job: "autoRefresh", at: ago(3 * 60_000), ok: true, detail: { repos: ["acme/web"] } },
      ],
      recentRequestActivity: [],
      nowMs: NOW,
    });
    expect(finished.map((item) => [item.label, item.outcome, item.detail])).toEqual([
      ["Update changed PRs", "ok", "acme/api"],
      ["Merged/closed drain", "failed", "gh auth expired"],
      ["Full refresh", "ok", "acme/web"],
    ]);

    // A skip says which it was; the drain's refresh skipping, once (the drain's).
    const skipped = buildActivityFinished({
      jobs: {
        ...jobs,
        autoRefresh: { ...jobs.autoRefresh, lastSkip: { reason: "already-in-progress", at: ago(60_000), kind: "changedPrs" } },
      },
      recentFinished: [],
      recentRequestActivity: [],
      nowMs: NOW,
    });
    expect(skipped.map((item) => item.label)).toEqual(["Update changed PRs"]);
    expect(
      buildActivityFinished({
        jobs: {
          ...jobs,
          autoRefresh: { ...jobs.autoRefresh, lastSkip: { reason: "busy", at: ago(60_000), kind: "mergedQueueDrain" } },
          mergedQueueDrain: { ...jobs.mergedQueueDrain, lastSkip: { reason: "busy", at: ago(60_000) } },
        },
        recentFinished: [],
        recentRequestActivity: [],
        nowMs: NOW,
      }).map((item) => item.label),
    ).toEqual(["Merged/closed drain"]);
  });

  test("each kind says what it does and what it doesn't update - the tooltips and the guide", () => {
    expect(ACTIVITY_KIND_GUIDE.map((guide) => guide.label)).toEqual([
      "Quick check",
      "Update changed PRs",
      "Full refresh",
      "Merged/closed drain",
      "Run script",
      "Fetch older merged PRs",
      "Ack/Clear",
    ]);
    ACTIVITY_KIND_GUIDE.forEach((guide) => {
      expect(guide.does).toBeTruthy();
      expect(guide.doesNotUpdate).toBeTruthy();
    });
    expect(describeActivityKind("quickCheck")).toMatch(/^Every 5 minutes.*Doesn't update: Comments, reviews and approvals/);
    // The dispatcher's name for the drain.
    expect(describeActivityKind("mergedDrain")).toBe(describeActivityKind("mergedQueueDrain"));
    expect(describeActivityKind("notesSave")).toBe("");
  });
});
