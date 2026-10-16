// Pure reducer for the activity drawer's SSE-fed job state (see
// REACT_MIGRATION_PLAN.md's notification-drawer plan). No React/DOM - all
// the "honest, not a fake queue" semantics live here so they're unit
// testable without a real EventSource. JobEventsProvider.jsx is the only
// caller; it owns the live connection and EventSource lifecycle, this
// module only owns what a given frame does to state.
export const { createPrJobEventsHelpers } = (() => {
  const createJobState = () => ({
    status: "idle",
    startedAt: null,
    lastFinishedAt: null,
    lastOk: null,
    lastError: null,
    lastSkip: null,
  });

  const createPrJobEventsHelpers = ({ now } = {}) => {
    const nowSafe = typeof now === "function" ? now : () => new Date().toISOString();

    const getInitialJobEventsState = () => ({
      connection: "connecting",
      lastEventAt: null,
      lastSnapshotAt: null,
      lastSeq: 0,
      jobs: {
        autoRefresh: createJobState(),
        quickCheck: { ...createJobState(), waitingOn: null },
        mergedQueueDrain: createJobState(),
      },
      // Flagged by quick-check, drained by mergedQueueDrain - this is the
      // one piece of the old (now-removed) #scheduler-badges display that
      // had no equivalent anywhere in the drawer, so it's carried here
      // instead of being silently dropped. Read off every envelope's own
      // bundled scheduler object (every frame carries it, not just a
      // mergedQueueDrain-specific one), so it stays current regardless of
      // which job most recently emitted.
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
      // Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering" follow-up):
      // the fields AppliedFilterSummary's "Applied filters" chip text
      // needs for its scheduler-summary portion (intervalMinutes/
      // manualCooldownMinutes/lastManualRunAt/lastAutoRunAt/
      // lastAutoSkipReason/lastAutoError) - previously only available as
      // a vanilla module-level `let` (index.page.js's latestSchedulerState,
      // mutated by renderSchedulerStatus), not reactive anywhere. Same
      // job-agnostic, whole-scheduler-snapshot category as the fields
      // above - read off every envelope's own bundled scheduler object.
      schedulerSummary: {
        intervalMinutes: 15,
        manualCooldownMinutes: 15,
        lastManualRunAt: null,
        lastAutoRunAt: null,
        lastAutoSkipReason: null,
        lastAutoError: null,
      },
    });

    const extractDispatcherQueue = (scheduler) =>
      Array.isArray(scheduler?.dispatcherQueue) ? scheduler.dispatcherQueue : [];

    const extractOpenAutoCircuitRepos = (scheduler) =>
      Array.isArray(scheduler?.openAutoCircuitRepos) ? scheduler.openAutoCircuitRepos : [];

    const extractSchedulerSummary = (scheduler, previous) => ({
      intervalMinutes: Number.isFinite(Number(scheduler?.intervalMinutes))
        ? Number(scheduler.intervalMinutes)
        : previous.intervalMinutes,
      manualCooldownMinutes: Number.isFinite(Number(scheduler?.manualCooldownMinutes))
        ? Number(scheduler.manualCooldownMinutes)
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

    const extractPendingCounts = (scheduler) => ({
      pendingOpenCount: Number(scheduler?.pendingOpenCount) || 0,
      pendingMergedClosedCount: Number(scheduler?.pendingMergedClosedCount) || 0,
    });

    const setConnectionState = (state, connection) => ({ ...state, connection });

    // Always authoritative regardless of seq - a fresh connect-time (or
    // reconnect-time) snapshot resets the dedupe counter and seeds every
    // job's current status/waitingOn straight from the server's own
    // in-memory scheduler state, not from replaying missed events.
    const applyJobEventsSnapshot = (state, payload) => {
      const scheduler = payload?.scheduler || {};
      const at = payload?.at || nowSafe();

      const jobs = {
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

    // envelope is either a `job` envelope ({job, phase, ok, detail, seq})
    // or a job-agnostic `scheduler` envelope ({seq} only, no job/phase) -
    // see view-prs-job-events-helpers.js. The latter only bumps lastEventAt/
    // lastSeq/pendingCounts; the drawer's own per-job rows don't change from
    // it (it drives the per-row progress indicator instead - see
    // JobEventsProvider).
    const applyJobEvent = (state, envelope) => {
      if (!envelope || typeof envelope !== "object") {
        return state;
      }
      if (typeof envelope.seq === "number" && envelope.seq <= state.lastSeq) {
        return state;
      }

      const at = envelope.at || nowSafe();
      const nextSeq = typeof envelope.seq === "number" ? envelope.seq : state.lastSeq;
      const jobKey = envelope.job;
      const previousJob = jobKey ? state.jobs[jobKey] : null;
      const pendingCounts = extractPendingCounts(envelope.scheduler);
      const dispatcherQueue = extractDispatcherQueue(envelope.scheduler);
      const openAutoCircuitRepos = extractOpenAutoCircuitRepos(envelope.scheduler);
      const schedulerSummary = extractSchedulerSummary(envelope.scheduler, state.schedulerSummary);

      if (!previousJob) {
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
      let nextJob = previousJob;

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
      // Exported for JobEventsProvider.jsx's own payload.scheduler fallback
      // (see that file's comment) - lets it normalize payload.scheduler
      // into the exact same schedulerSummary shape, until the first real
      // SSE snapshot arrives.
      extractSchedulerSummary,
    };
  };

  return { createPrJobEventsHelpers };
})();
