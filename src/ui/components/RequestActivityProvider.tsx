import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPrActivityBadgesHelpers } from '../helpers/pr-activity-badges.helpers.ts';
import { createPrSchedulerStatusHelpers } from '../helpers/pr-scheduler-status.helpers.ts';
import {
  RequestActivityContext,
  RequestActivityDisplayContext,
  type RecentRequestActivity,
  type RequestActivityKey,
  type RequestActivityValue,
} from '../state/RequestActivityContext';

const REQUEST_ACTIVITY_LABELS: Record<RequestActivityKey, string> = {
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
const REQUEST_ACTIVITY_KEYS = Object.keys(REQUEST_ACTIVITY_LABELS) as RequestActivityKey[];
const RECENT_REQUEST_ACTIVITY_LIMIT = 10;
const REQUEST_ACTIVITY_WARN_MS = 2 * 60 * 1000;
const REQUEST_ACTIVITY_CRITICAL_MS = 6 * 60 * 1000;

// The scheduler fields this Provider reads.
type SchedulerState = Parameters<RequestActivityValue['renderSchedulerStatus']>[0] & {
  lastAutoAttemptAt?: string;
};

interface ActivityState {
  // In-flight count and when the oldest in-flight request of each kind
  // started (0 when none).
  counters: Record<string, number>;
  startedAtMs: Record<string, number>;
  recentEntries: RecentRequestActivity[];
  latestSchedulerState: NonNullable<SchedulerState>;
}

const createDefaultActivityState = (): ActivityState => ({
  counters: Object.fromEntries(REQUEST_ACTIVITY_KEYS.map((key) => [key, 0])),
  startedAtMs: Object.fromEntries(REQUEST_ACTIVITY_KEYS.map((key) => [key, 0])),
  recentEntries: [],
  latestSchedulerState: {},
});

const formatElapsedLabel = (elapsedMs: unknown): string => {
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

const getElapsedFromStartMs = (startMs: unknown): number | null => {
  const parsedStart = Number(startMs || 0);
  if (!Number.isFinite(parsedStart) || parsedStart <= 0) {
    return null;
  }
  return Math.max(0, Date.now() - parsedStart);
};

const withElapsedSuffix = (label: string, elapsedMs?: number | null): string => {
  if (!Number.isFinite(Number(elapsedMs)) || Number(elapsedMs) < 0) {
    return label;
  }
  return `${label} (${formatElapsedLabel(elapsedMs)})`;
};

const getRequestActivitySeverityClass = (elapsedMs?: number | null): string => {
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

// Built once, not per render.
const { getRequestActivityBadges } = createPrActivityBadgesHelpers({
  withElapsedSuffix,
  getRequestActivitySeverityClass,
});

const buildBadges = (activityState: ActivityState) => {
  // Iterates every known kind generically rather than one hand-written
  // branch per key (a hand-written-branch shape once silently dropped the
  // "labelApply" key).
  const activeEntries = REQUEST_ACTIVITY_KEYS.filter((key) => (activityState.counters[key] ?? 0) > 0).map(
    (key) => ({
      label: `${REQUEST_ACTIVITY_LABELS[key]} x${activityState.counters[key]}`,
      elapsedMs: getElapsedFromStartMs(activityState.startedAtMs[key]),
    }),
  );
  const isAutoRunInProgress = Boolean(activityState.latestSchedulerState?.isAutoRunInProgress);
  const autoRunElapsedMs = isAutoRunInProgress
    ? getElapsedFromStartMs(Date.parse(String(activityState.latestSchedulerState?.lastAutoAttemptAt || '')))
    : null;
  return getRequestActivityBadges({ activeEntries, isAutoRunInProgress, autoRunElapsedMs });
};

/**
 * Owns request activity (the in-flight request counters/elapsed times behind
 * the activity drawer's badges, and its "recent activity" list) and the
 * latest scheduler state.
 *
 * Mounted above BackfillStatusProvider, AutoRenderBlockingProvider and
 * PrDataProvider in mountAppRoot() and needing no other Context, so all of
 * them - and the action hooks - can read it directly.
 *
 * renderSchedulerStatus (called from JobEventsProvider's SSE frames and
 * useQuickCheckActions) records the scheduler state for the "Auto run"
 * badge and announces the scheduler's active PRs with the
 * 'pr-active-progress-update' window event PrTableApp listens for.
 *
 * The badges and recent list are this Provider's own state, published on
 * RequestActivityDisplayContext (AppRoot passes them to the drawer); the
 * first state is the idle badge set. The bookkeeping itself stays a ref
 * (it's mutated in place by every begin/finish, read synchronously); only
 * the derived badges/list are state. RequestActivityContext's value is
 * stable for this Provider's lifetime, so the many hooks that call these
 * functions never re-render because of them.
 *
 * `loadOnMount` (set by mountAppRoot, like PrDataProvider's) runs the startup
 * GET /view-prs/scheduler; failures are ignored.
 */
export function RequestActivityProvider({
  loadOnMount = false,
  children,
}: {
  loadOnMount?: boolean;
  children?: ReactNode;
}) {
  const activityRef = useRef<ActivityState | null>(null);
  if (activityRef.current === null) {
    activityRef.current = createDefaultActivityState();
  }
  // Set just above and never cleared.
  const getActivityState = (): ActivityState => activityRef.current as ActivityState;
  const [requestActivityBadges, setRequestActivityBadges] = useState(() => buildBadges(getActivityState()));
  const [recentRequestActivity, setRecentRequestActivity] = useState<RecentRequestActivity[]>([]);

  const renderRequestActivity = useCallback(() => {
    setRequestActivityBadges(buildBadges(activityRef.current as ActivityState));
  }, []);

  // Unknown keys are ignored.
  const setRequestActivityCounter = useCallback((key: string, delta: number = 0) => {
    const activityState = activityRef.current as ActivityState;
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

  const recordRecentRequestActivity = useCallback((key: string) => {
    const activityState = activityRef.current as ActivityState;
    const label = REQUEST_ACTIVITY_LABELS[key as RequestActivityKey] || key;
    activityState.recentEntries = [
      { key, label, finishedAt: new Date().toISOString() },
      ...activityState.recentEntries,
    ].slice(0, RECENT_REQUEST_ACTIVITY_LIMIT);
    setRecentRequestActivity(activityState.recentEntries);
  }, []);

  const beginRequestActivity = useCallback<RequestActivityValue['beginRequestActivity']>(
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

  const renderSchedulerStatus = useCallback<RequestActivityValue['renderSchedulerStatus']>(
    (schedulerRaw = {}) => {
      const scheduler = schedulerRaw || {};
      // The server (app.js's buildActivePrKey) sends activePrNumbers as
      // { repo, prNumber } pairs; PrTableApp keys rows the same way.
      const activePrNumbers = Array.isArray(scheduler.activePrNumbers) ? scheduler.activePrNumbers : [];
      window.dispatchEvent(new CustomEvent('pr-active-progress-update', { detail: { activePrNumbers } }));
      (activityRef.current as ActivityState).latestSchedulerState = scheduler;
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
      fetch: (input) => fetch(input),
      renderSchedulerStatus: (scheduler) => renderSchedulerStatus(scheduler as SchedulerState),
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
