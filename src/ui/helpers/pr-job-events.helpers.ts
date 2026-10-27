// Pure reducer for the activity popover's SSE-fed job state. No React/DOM -
// all the "honest, not a fake queue" semantics live here so they're unit
// testable without a real EventSource. JobEventsProvider.tsx owns the live
// connection and EventSource lifecycle and applies frames through this
// module, which only owns what a given frame does to state;
// JobEventsContext.tsx uses getInitialJobEventsState for its default value.

export type JobKey = "autoRefresh" | "quickCheck" | "mergedQueueDrain";

export interface JobState {
  status: "idle" | "running";
  startedAt: string | null;
  lastFinishedAt: string | null;
  lastOk: boolean | null;
  lastError: unknown;
  lastSkip: { reason: string | null; at: string } | null;
  // Only quickCheck: the job it's waiting for, when deferred.
  waitingOn?: { job: string | null; since: string } | null;
}

export interface SchedulerSummary {
  intervalMinutes: number;
  manualCooldownMinutes: number;
  lastManualRunAt: unknown;
  lastAutoRunAt: unknown;
  lastAutoSkipReason: unknown;
  lastAutoError: unknown;
}

export interface FinishedJob {
  job: string;
  at: string;
  ok: boolean | null;
  detail: Record<string, unknown>;
}

export interface JobEventsState {
  connection: string;
  lastEventAt: string | null;
  lastSnapshotAt: string | null;
  lastSeq: number;
  jobs: Record<JobKey, JobState>;
  pendingOpenCount: number;
  pendingMergedClosedCount: number;
  recentFinished: FinishedJob[];
  dispatcherQueue: unknown[];
  openAutoCircuitRepos: unknown[];
  schedulerSummary: SchedulerSummary;
}

// The scheduler state the server bundles with every SSE frame.
export interface SchedulerSnapshot {
  isAutoRunInProgress?: boolean;
  isQuickCheckInProgress?: boolean;
  isMergedDrainInProgress?: boolean;
  quickCheckSkippedWhileAutoRunInProgress?: boolean;
  lastAutoRunAt?: string | null;
  lastAutoError?: unknown;
  lastQuickCheckAt?: string | null;
  lastQuickCheckError?: unknown;
  lastMergedDrainAt?: string | null;
  lastManualRunAt?: unknown;
  lastAutoSkipReason?: unknown;
  intervalMinutes?: unknown;
  manualCooldownMinutes?: unknown;
  pendingOpenCount?: unknown;
  pendingMergedClosedCount?: unknown;
  dispatcherQueue?: unknown;
  openAutoCircuitRepos?: unknown;
}

// A `job` envelope ({job, phase, ok, detail, seq}) or a job-agnostic
// `scheduler` envelope ({seq} only) - see view-prs-job-events-helpers.js.
export interface JobEventEnvelope {
  seq?: number;
  at?: string;
  job?: string;
  phase?: "start" | "finish" | "skipped" | "deferred" | string;
  ok?: boolean | null;
  detail?: { error?: unknown; reason?: string; waitingOn?: string; [field: string]: unknown };
  scheduler?: SchedulerSnapshot;
}

const createJobState = (): JobState => ({
  status: "idle",
  startedAt: null,
  lastFinishedAt: null,
  lastOk: null,
  lastError: null,
  lastSkip: null,
});

const isJobKey = (value: unknown): value is JobKey =>
  value === "autoRefresh" || value === "quickCheck" || value === "mergedQueueDrain";

const createPrJobEventsHelpers = ({ now }: { now?: () => string } = {}) => {
  const nowSafe = typeof now === "function" ? now : () => new Date().toISOString();

  const getInitialJobEventsState = (): JobEventsState => ({
    connection: "connecting",
    lastEventAt: null,
    lastSnapshotAt: null,
    lastSeq: 0,
    jobs: {
      autoRefresh: createJobState(),
      quickCheck: { ...createJobState(), waitingOn: null },
      mergedQueueDrain: createJobState(),
    },
    // Flagged by quick-check, drained by mergedQueueDrain. Read off every
    // envelope's own bundled scheduler object (every frame carries it, not
    // just a mergedQueueDrain-specific one), so it stays current
    // regardless of which job most recently emitted.
    pendingOpenCount: 0,
    pendingMergedClosedCount: 0,
    recentFinished: [],
    // The dispatcher's real, ordered upcoming/running task list (see
    // view-prs-dispatcher-helpers.js's getDispatcherQueueSnapshot) -
    // same job-agnostic, whole-scheduler-snapshot category as the
    // pending counts above, extracted the same way.
    dispatcherQueue: [],
    // Repos whose own auto-refresh circuit breaker is currently open
    // (see autoCircuitByRepo in app.js) - same job-agnostic,
    // whole-scheduler-snapshot category as dispatcherQueue above.
    openAutoCircuitRepos: [],
    // The scheduler fields the PR data summary's "Applied filters" text
    // shows (interval, cooldown, last manual/auto run, last skip reason
    // and error) - same whole-scheduler-snapshot category, read off every
    // envelope's bundled scheduler object.
    schedulerSummary: {
      intervalMinutes: 15,
      manualCooldownMinutes: 15,
      lastManualRunAt: null,
      lastAutoRunAt: null,
      lastAutoSkipReason: null,
      lastAutoError: null,
    },
  });

  const extractDispatcherQueue = (scheduler: SchedulerSnapshot | undefined): unknown[] =>
    Array.isArray(scheduler?.dispatcherQueue) ? scheduler.dispatcherQueue : [];

  const extractOpenAutoCircuitRepos = (scheduler: SchedulerSnapshot | undefined): unknown[] =>
    Array.isArray(scheduler?.openAutoCircuitRepos) ? scheduler.openAutoCircuitRepos : [];

  // Missing fields keep their previous values.
  const extractSchedulerSummary = (
    scheduler: SchedulerSnapshot | undefined,
    previous: SchedulerSummary,
  ): SchedulerSummary => ({
    intervalMinutes: Number.isFinite(Number(scheduler?.intervalMinutes))
      ? Number(scheduler?.intervalMinutes)
      : previous.intervalMinutes,
    manualCooldownMinutes: Number.isFinite(Number(scheduler?.manualCooldownMinutes))
      ? Number(scheduler?.manualCooldownMinutes)
      : previous.manualCooldownMinutes,
    lastManualRunAt:
      scheduler?.lastManualRunAt !== undefined ? scheduler.lastManualRunAt : previous.lastManualRunAt,
    lastAutoRunAt:
      scheduler?.lastAutoRunAt !== undefined ? scheduler.lastAutoRunAt : previous.lastAutoRunAt,
    lastAutoSkipReason:
      scheduler?.lastAutoSkipReason !== undefined
        ? scheduler.lastAutoSkipReason
        : previous.lastAutoSkipReason,
    lastAutoError:
      scheduler?.lastAutoError !== undefined ? scheduler.lastAutoError : previous.lastAutoError,
  });

  const extractPendingCounts = (scheduler: SchedulerSnapshot | undefined) => ({
    pendingOpenCount: Number(scheduler?.pendingOpenCount) || 0,
    pendingMergedClosedCount: Number(scheduler?.pendingMergedClosedCount) || 0,
  });

  const setConnectionState = (state: JobEventsState, connection: string): JobEventsState => ({
    ...state,
    connection,
  });

  // Always authoritative regardless of seq - a fresh connect-time (or
  // reconnect-time) snapshot resets the dedupe counter and seeds every
  // job's current status/waitingOn straight from the server's own
  // in-memory scheduler state, not from replaying missed events.
  const applyJobEventsSnapshot = (
    state: JobEventsState,
    payload: { scheduler?: SchedulerSnapshot; at?: string } | null | undefined,
  ): JobEventsState => {
    const scheduler: SchedulerSnapshot = payload?.scheduler || {};
    const at = payload?.at || nowSafe();

    const jobs: Record<JobKey, JobState> = {
      autoRefresh: {
        ...state.jobs.autoRefresh,
        status: scheduler.isAutoRunInProgress ? "running" : "idle",
        lastFinishedAt: scheduler.lastAutoRunAt || state.jobs.autoRefresh.lastFinishedAt,
        lastError:
          scheduler.lastAutoError !== undefined
            ? scheduler.lastAutoError
            : state.jobs.autoRefresh.lastError,
      },
      quickCheck: {
        ...state.jobs.quickCheck,
        status: scheduler.isQuickCheckInProgress ? "running" : "idle",
        lastFinishedAt: scheduler.lastQuickCheckAt || state.jobs.quickCheck.lastFinishedAt,
        lastError:
          scheduler.lastQuickCheckError !== undefined
            ? scheduler.lastQuickCheckError
            : state.jobs.quickCheck.lastError,
        waitingOn: scheduler.quickCheckSkippedWhileAutoRunInProgress
          ? { job: "autoRefresh", since: at }
          : null,
      },
      mergedQueueDrain: {
        ...state.jobs.mergedQueueDrain,
        status: scheduler.isMergedDrainInProgress ? "running" : "idle",
        lastFinishedAt: scheduler.lastMergedDrainAt || state.jobs.mergedQueueDrain.lastFinishedAt,
      },
    };

    return {
      ...state,
      connection: "open",
      lastEventAt: at,
      lastSnapshotAt: at,
      lastSeq: 0,
      jobs,
      ...extractPendingCounts(scheduler),
      dispatcherQueue: extractDispatcherQueue(scheduler),
      openAutoCircuitRepos: extractOpenAutoCircuitRepos(scheduler),
      schedulerSummary: extractSchedulerSummary(scheduler, state.schedulerSummary),
    };
  };

  // A job-agnostic `scheduler` envelope only bumps lastEventAt/lastSeq and
  // the scheduler-snapshot fields; the drawer's own per-job rows don't
  // change from it (it drives the per-row progress indicator instead -
  // see JobEventsProvider). Envelopes at or below the last seq are dropped.
  const applyJobEvent = (state: JobEventsState, envelope: JobEventEnvelope | null | undefined): JobEventsState => {
    if (!envelope || typeof envelope !== "object") {
      return state;
    }
    if (typeof envelope.seq === "number" && envelope.seq <= state.lastSeq) {
      return state;
    }

    const at = envelope.at || nowSafe();
    const nextSeq = typeof envelope.seq === "number" ? envelope.seq : state.lastSeq;
    const jobKey = envelope.job;
    // Unknown job names are treated like a scheduler envelope.
    const previousJob = isJobKey(jobKey) ? state.jobs[jobKey] : null;
    const pendingCounts = extractPendingCounts(envelope.scheduler);
    const dispatcherQueue = extractDispatcherQueue(envelope.scheduler);
    const openAutoCircuitRepos = extractOpenAutoCircuitRepos(envelope.scheduler);
    const schedulerSummary = extractSchedulerSummary(envelope.scheduler, state.schedulerSummary);

    if (!previousJob || !isJobKey(jobKey)) {
      return {
        ...state,
        connection: "open",
        lastEventAt: at,
        lastSeq: nextSeq,
        ...pendingCounts,
        dispatcherQueue,
        openAutoCircuitRepos,
        schedulerSummary,
      };
    }

    const isQuickCheck = jobKey === "quickCheck";
    let nextJob: JobState = previousJob;

    switch (envelope.phase) {
      case "start":
        nextJob = {
          ...previousJob,
          status: "running",
          startedAt: at,
          ...(isQuickCheck ? { waitingOn: null } : {}),
        };
        break;
      case "finish":
        nextJob = {
          ...previousJob,
          status: "idle",
          lastFinishedAt: at,
          lastOk: envelope.ok ?? null,
          lastError: envelope.detail?.error ?? null,
          ...(isQuickCheck ? { waitingOn: null } : {}),
        };
        break;
      case "skipped":
        // A skip is not a run - status is deliberately left untouched so
        // a dropped manual trigger never flickers "running".
        nextJob = {
          ...previousJob,
          lastSkip: { reason: envelope.detail?.reason || null, at },
          ...(isQuickCheck ? { waitingOn: null } : {}),
        };
        break;
      case "deferred":
        nextJob = {
          ...previousJob,
          waitingOn: { job: envelope.detail?.waitingOn || null, since: at },
        };
        break;
      default:
        break;
    }

    let recentFinished = state.recentFinished;
    if (envelope.phase === "finish") {
      recentFinished = [
        { job: jobKey, at, ok: envelope.ok ?? null, detail: envelope.detail || {} },
        ...state.recentFinished,
      ].slice(0, 10);
    }

    return {
      ...state,
      connection: "open",
      lastEventAt: at,
      lastSeq: nextSeq,
      jobs: { ...state.jobs, [jobKey]: nextJob },
      recentFinished,
      ...pendingCounts,
      dispatcherQueue,
      openAutoCircuitRepos,
      schedulerSummary,
    };
  };

  return {
    getInitialJobEventsState,
    setConnectionState,
    applyJobEventsSnapshot,
    applyJobEvent,
    // Exported for JobEventsProvider.tsx's own payload.scheduler fallback
    // (see that file's comment) - lets it normalize payload.scheduler
    // into the exact same schedulerSummary shape, until the first real
    // SSE snapshot arrives.
    extractSchedulerSummary,
  };
};

export { createPrJobEventsHelpers };
