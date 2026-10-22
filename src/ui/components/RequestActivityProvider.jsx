import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPrActivityBadgesHelpers } from '../helpers/pr-activity-badges.helpers.js';
import { createPrSchedulerStatusHelpers } from '../helpers/pr-scheduler-status.helpers.js';
import { RequestActivityContext, RequestActivityDisplayContext } from '../state/RequestActivityContext';

// Phase F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
// default state for the request-activity-counter/history/scheduler-state
// bookkeeping below - matches index.page.js's old module-scope
// requestActivityCounters/requestActivityStartedAtMs/
// recentRequestActivityEntries/latestSchedulerState defaults exactly.
const REQUEST_ACTIVITY_LABELS = {
  runScript: 'Run script',
  ackClear: 'Ack/Clear',
  singlePr: 'Single PR update',
  dataLoad: 'Data refresh',
  backfill: 'Backfill request',
  labelApply: 'Apply label',
  checkboxToggle: 'Checkbox toggle',
  notesSave: 'Notes save',
  authorComment: 'Author comment',
};
const RECENT_REQUEST_ACTIVITY_LIMIT = 10;
const REQUEST_ACTIVITY_WARN_MS = 2 * 60 * 1000;
const REQUEST_ACTIVITY_CRITICAL_MS = 6 * 60 * 1000;

const createDefaultActivityState = () => ({
  counters: Object.fromEntries(Object.keys(REQUEST_ACTIVITY_LABELS).map((key) => [key, 0])),
  startedAtMs: Object.fromEntries(Object.keys(REQUEST_ACTIVITY_LABELS).map((key) => [key, 0])),
  recentEntries: [],
  latestSchedulerState: {},
});

const formatElapsedLabel = (elapsedMs) => {
  const totalSeconds = Math.max(
    0,
    Math.floor(Number.isFinite(Number(elapsedMs)) ? Number(elapsedMs) / 1000 : 0),
  );
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
};

const getElapsedFromStartMs = (startMs) => {
  const parsedStart = Number(startMs || 0);
  if (!Number.isFinite(parsedStart) || parsedStart <= 0) {
    return null;
  }
  return Math.max(0, Date.now() - parsedStart);
};

const withElapsedSuffix = (label, elapsedMs) => {
  if (!Number.isFinite(Number(elapsedMs)) || Number(elapsedMs) < 0) {
    return label;
  }
  return `${label} (${formatElapsedLabel(elapsedMs)})`;
};

const getRequestActivitySeverityClass = (elapsedMs) => {
  const safeElapsedMs = Number(elapsedMs);
  if (!Number.isFinite(safeElapsedMs) || safeElapsedMs < 0) {
    return '';
  }
  if (safeElapsedMs >= REQUEST_ACTIVITY_CRITICAL_MS) {
    return 'scheduler-badge-critical';
  }
  if (safeElapsedMs >= REQUEST_ACTIVITY_WARN_MS) {
    return 'scheduler-badge-warning';
  }
  return '';
};

// Built once, not per-render - same "stable, zero-per-render-state"
// precedent as useSinglePrUpdate.jsx's own module-level instantiation.
const { getRequestActivityBadges } = createPrActivityBadgesHelpers({
  withElapsedSuffix,
  getRequestActivitySeverityClass,
});

const buildBadges = (activityState) => {
  const activeEntries = Object.keys(REQUEST_ACTIVITY_LABELS)
    // Iterates REQUEST_ACTIVITY_LABELS generically rather than one
    // hand-written branch per key - see index.page.js's git history for why
    // (a hand-written-branch shape silently dropped the "labelApply" key for
    // a while).
    .filter((key) => activityState.counters[key] > 0)
    .map((key) => ({
      label: `${REQUEST_ACTIVITY_LABELS[key]} x${activityState.counters[key]}`,
      elapsedMs: getElapsedFromStartMs(activityState.startedAtMs[key]),
    }));
  const isAutoRunInProgress = Boolean(activityState.latestSchedulerState?.isAutoRunInProgress);
  const autoRunElapsedMs = isAutoRunInProgress
    ? getElapsedFromStartMs(Date.parse(String(activityState.latestSchedulerState?.lastAutoAttemptAt || '')))
    : null;
  return getRequestActivityBadges({ activeEntries, isAutoRunInProgress, autoRunElapsedMs });
};

/**
 * Window-bridge elimination Phase 7.3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * owns request activity (the in-flight request counters/elapsed times behind
 * the activity drawer's badges, and its "recent activity" list) and the
 * latest scheduler state. Two halves moved in here:
 *
 * - From PrDataProvider (Phase F.2): beginRequestActivity/renderRequestActivity
 *   and their ref-held bookkeeping. They had to leave it because two of their
 *   callers, BackfillStatusProvider and AutoRenderBlockingProvider, are
 *   PrDataProvider's *ancestors* and could only reach them through
 *   window.renderRequestActivity. Mounted above all three in mountAppRoot(),
 *   this Provider needs no other Context, so all of them read it directly.
 * - From index.page.js: renderSchedulerStatus (JobEventsProvider's SSE frames
 *   and useQuickCheckActions call it, via window.renderSchedulerStatus) and
 *   the startup scheduler load. It records the scheduler state for the "Auto
 *   run" badge and announces the scheduler's active PRs with the
 *   'pr-active-progress-update' window event PrTableApp listens for.
 *   index.page.js also toggled each row's progress-indicator `hidden`
 *   attribute directly; PrNumberCell already renders that from PrTableApp's
 *   state, so that DOM write is dropped rather than moved.
 *
 * The badges and recent list are this Provider's own state now, published on
 * RequestActivityDisplayContext (AppRoot passes them to the drawer). AppRoot
 * used to hold them, pushed in through window.updateReactRequestActivityBadges/
 * updateReactRecentRequestActivity. The first state is the idle badge set, so
 * there's no startup "render once React is ready" push any more either.
 *
 * The bookkeeping itself stays a ref (it's mutated in place by every
 * begin/finish, read synchronously); only the derived badges/list are state.
 * RequestActivityContext's value is stable for this Provider's lifetime, so
 * the many hooks that call these functions never re-render because of them.
 *
 * `loadOnMount` (set by mountAppRoot, like PrDataProvider's) runs the startup
 * GET /view-prs/scheduler; failures are ignored, as initPage's were.
 */
export function RequestActivityProvider({ loadOnMount = false, children }) {
  const activityRef = useRef(null);
  if (activityRef.current === null) {
    activityRef.current = createDefaultActivityState();
  }
  const [requestActivityBadges, setRequestActivityBadges] = useState(() => buildBadges(activityRef.current));
  const [recentRequestActivity, setRecentRequestActivity] = useState([]);

  const renderRequestActivity = useCallback(() => {
    setRequestActivityBadges(buildBadges(activityRef.current));
  }, []);

  const setRequestActivityCounter = useCallback((key, delta = 0) => {
    const activityState = activityRef.current;
    if (!Object.prototype.hasOwnProperty.call(activityState.counters, key)) {
      return;
    }
    const next =
      Number(activityState.counters[key] || 0) + (Number.isFinite(Number(delta)) ? Number(delta) : 0);
    const safeNext = Math.max(0, next);
    activityState.counters[key] = safeNext;
    if (safeNext > 0 && Number(activityState.startedAtMs[key] || 0) <= 0) {
      activityState.startedAtMs[key] = Date.now();
    }
    if (safeNext === 0) {
      activityState.startedAtMs[key] = 0;
    }
  }, []);

  const recordRecentRequestActivity = useCallback((key) => {
    const activityState = activityRef.current;
    const label = REQUEST_ACTIVITY_LABELS[key] || key;
    activityState.recentEntries = [
      { key, label, finishedAt: new Date().toISOString() },
      ...activityState.recentEntries,
    ].slice(0, RECENT_REQUEST_ACTIVITY_LIMIT);
    setRecentRequestActivity(activityState.recentEntries);
  }, []);

  const beginRequestActivity = useCallback(
    (key) => {
      setRequestActivityCounter(key, 1);
      renderRequestActivity();
      let ended = false;
      return () => {
        if (ended) {
          return;
        }
        ended = true;
        setRequestActivityCounter(key, -1);
        renderRequestActivity();
        recordRecentRequestActivity(key);
      };
    },
    [setRequestActivityCounter, renderRequestActivity, recordRecentRequestActivity],
  );

  const renderSchedulerStatus = useCallback(
    (schedulerRaw = {}) => {
      const scheduler = schedulerRaw || {};
      // The server (app.js's buildActivePrKey) sends activePrNumbers as
      // { repo, prNumber } pairs; PrTableApp keys rows the same way.
      const activePrNumbers = Array.isArray(scheduler.activePrNumbers) ? scheduler.activePrNumbers : [];
      window.dispatchEvent(new CustomEvent('pr-active-progress-update', { detail: { activePrNumbers } }));
      activityRef.current.latestSchedulerState = scheduler;
      renderRequestActivity();
    },
    [renderRequestActivity],
  );

  const hasStartedInitialLoadRef = useRef(false);
  useEffect(() => {
    if (!loadOnMount || hasStartedInitialLoadRef.current) {
      return;
    }
    hasStartedInitialLoadRef.current = true;
    const { loadSchedulerStatus } = createPrSchedulerStatusHelpers({
      fetch: (...args) => fetch(...args),
      renderSchedulerStatus,
    });
    loadSchedulerStatus().catch(() => {
      // Ignore startup scheduler fetch failures; the SSE connection keeps
      // the scheduler state current from here on.
    });
  }, [loadOnMount, renderSchedulerStatus]);

  const actions = useMemo(
    () => ({ beginRequestActivity, renderRequestActivity, renderSchedulerStatus }),
    [beginRequestActivity, renderRequestActivity, renderSchedulerStatus],
  );
  const display = useMemo(
    () => ({ requestActivityBadges, recentRequestActivity }),
    [requestActivityBadges, recentRequestActivity],
  );

  return (
    <RequestActivityContext.Provider value={actions}>
      <RequestActivityDisplayContext.Provider value={display}>{children}</RequestActivityDisplayContext.Provider>
    </RequestActivityContext.Provider>
  );
}
