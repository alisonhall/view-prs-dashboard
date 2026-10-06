const { EventEmitter } = require("events");

const JOB_EVENT_CHANNEL = "view-prs:job-event";

const JOB_NAMES = {
  AUTO_REFRESH: "autoRefresh",
  QUICK_CHECK: "quickCheck",
  MERGED_QUEUE_DRAIN: "mergedQueueDrain",
};

const JOB_PHASES = {
  START: "start",
  FINISH: "finish",
  SKIPPED: "skipped",
  DEFERRED: "deferred",
};

// createViewPrsJobEventsHelpers wires the in-process EventEmitter used to
// push background-job lifecycle events to any connected SSE clients (see
// routes/view-prs-events-routes.js). getViewPrsSchedulerPublicState is
// injected (not called standalone) because every envelope - not just the
// initial connect-time snapshot - bundles the full scheduler state, so a
// client can always re-render #scheduler-badges/details-text from whatever
// event woke it up without a separate fetch (see the "Polling retirement"
// section of the feature's plan).
const createViewPrsJobEventsHelpers = ({
  console,
  getViewPrsSchedulerPublicState,
  now = () => new Date().toISOString(),
  // Bounds how often emitSchedulerStateChanged actually pushes a frame -
  // see that function's own comment. 0 disables throttling entirely.
  schedulerStateThrottleMs = 250,
}) => {
  const consoleSafe = console || globalThis.console;
  const getViewPrsSchedulerPublicStateSafe =
    typeof getViewPrsSchedulerPublicState === "function"
      ? getViewPrsSchedulerPublicState
      : () => null;
  const schedulerStateThrottleMsSafe =
    Number.isFinite(schedulerStateThrottleMs) && schedulerStateThrottleMs >= 0
      ? schedulerStateThrottleMs
      : 0;

  const emitter = new EventEmitter();
  // Unlimited: each connected browser tab holds one listener for the
  // lifetime of its SSE connection, and reloads/reconnects churn these
  // faster than the default max-10 warning threshold expects.
  emitter.setMaxListeners(0);

  let seqCounter = 0;
  const nextSeq = () => {
    seqCounter += 1;
    return seqCounter;
  };

  const buildJobEventEnvelope = ({ job, phase, ok = null, detail = {} } = {}) => ({
    type: "job",
    job,
    phase,
    at: now(),
    seq: nextSeq(),
    ok,
    detail: detail || {},
    scheduler: getViewPrsSchedulerPublicStateSafe(),
  });

  const emitJobEvent = (eventInput) => {
    try {
      const envelope = buildJobEventEnvelope(eventInput);
      emitter.emit(JOB_EVENT_CHANNEL, envelope);
      return envelope;
    } catch (error) {
      // Must never throw into a caller mid scheduler-run - a dead SSE
      // listener or a formatting bug here can't be allowed to fail an
      // actual background job.
      consoleSafe?.error?.("[view-prs] emitJobEvent failed", error);
      return null;
    }
  };

  const buildSchedulerStateEnvelope = () => ({
    type: "scheduler",
    at: now(),
    seq: nextSeq(),
    scheduler: getViewPrsSchedulerPublicStateSafe(),
  });

  const emitSchedulerStateChangedImmediate = () => {
    try {
      const envelope = buildSchedulerStateEnvelope();
      emitter.emit(JOB_EVENT_CHANNEL, envelope);
      return envelope;
    } catch (error) {
      consoleSafe?.error?.(
        "[view-prs] emitSchedulerStateChanged failed",
        error,
      );
      return null;
    }
  };

  let lastSchedulerEmitAtMs = 0;
  let pendingSchedulerEmitTimer = null;

  // Job-agnostic: fired whenever activePrNumbers changes (per-PR progress
  // during a refresh), independent of any single job's start/finish
  // lifecycle - see syncSchedulerActivePrNumbers in app.js. That function
  // fires roughly twice per PR touched by a refresh, which without a bound
  // here could push (and have every connected client re-render a full
  // table scan from) many frames per second during a large multi-repo run.
  //
  // Leading+trailing throttle: the first call after a quiet period fires
  // immediately, and any further calls within schedulerStateThrottleMsSafe
  // coalesce into exactly one trailing call carrying whatever the latest
  // state is when that call actually fires - so a sustained burst never
  // delays beyond one throttle window, and the final state is never
  // dropped (unlike a plain rate-limit-and-drop approach would).
  const emitSchedulerStateChanged = () => {
    // syncSchedulerActivePrNumbers (app.js) calls this roughly twice per PR
    // touched by a refresh - with zero SSE clients connected (the common
    // case for most of this process's life), building a full scheduler
    // envelope and running the throttle's timer bookkeeping on every one of
    // those calls would be pure waste. emitter.emit itself is already a
    // cheap no-op with no listeners, but everything leading up to it isn't.
    if (emitter.listenerCount(JOB_EVENT_CHANNEL) === 0) {
      return null;
    }

    if (schedulerStateThrottleMsSafe === 0) {
      return emitSchedulerStateChangedImmediate();
    }

    const nowMs = Date.now();
    const elapsedMs = nowMs - lastSchedulerEmitAtMs;

    if (elapsedMs >= schedulerStateThrottleMsSafe) {
      lastSchedulerEmitAtMs = nowMs;
      return emitSchedulerStateChangedImmediate();
    }

    if (!pendingSchedulerEmitTimer) {
      pendingSchedulerEmitTimer = setTimeout(() => {
        pendingSchedulerEmitTimer = null;
        lastSchedulerEmitAtMs = Date.now();
        emitSchedulerStateChangedImmediate();
      }, schedulerStateThrottleMsSafe - elapsedMs);
      pendingSchedulerEmitTimer.unref?.();
    }
    // Nothing to return synchronously yet - the trailing call above will
    // emit once the window elapses.
    return null;
  };

  const subscribeToJobEvents = (listener) => {
    if (typeof listener !== "function") {
      return () => {};
    }
    emitter.on(JOB_EVENT_CHANNEL, listener);
    return () => {
      emitter.off(JOB_EVENT_CHANNEL, listener);
    };
  };

  const getJobEventsSubscriberCount = () =>
    emitter.listenerCount(JOB_EVENT_CHANNEL);

  return {
    JOB_EVENT_CHANNEL,
    JOB_NAMES,
    JOB_PHASES,
    buildJobEventEnvelope,
    emitJobEvent,
    emitSchedulerStateChanged,
    subscribeToJobEvents,
    getJobEventsSubscriberCount,
  };
};

module.exports = {
  createViewPrsJobEventsHelpers,
  JOB_NAMES,
  JOB_PHASES,
};
