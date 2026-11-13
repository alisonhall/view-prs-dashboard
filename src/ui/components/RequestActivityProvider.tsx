import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPrSchedulerStatusHelpers } from '../helpers/pr-scheduler-status.helpers.ts';
import {
  RequestActivityContext,
  RequestActivityDisplayContext,
  type ActiveRequestActivity,
  type RecentRequestActivity,
  type RequestActivityKey,
  type RequestActivityThresholds,
  type RequestActivityValue,
} from '../state/RequestActivityContext';

const REQUEST_ACTIVITY_LABELS: Record<RequestActivityKey, string> = {
  runScript: 'Run script',
  ackClear: 'Ack/Clear',
  singlePr: 'Single PR update',
  dataLoad: 'Data refresh',
  olderMerged: 'Fetch older merged PRs',
  backfill: 'Backfill request',
  labelApply: 'Apply label',
  checkboxToggle: 'Checkbox toggle',
  notesSave: 'Notes save',
  threadCheck: 'Conversation check',
  customSection: 'Custom section',
  authorComment: 'Author comment',
};
const REQUEST_ACTIVITY_KEYS = Object.keys(REQUEST_ACTIVITY_LABELS) as RequestActivityKey[];
const RECENT_REQUEST_ACTIVITY_LIMIT = 10;
// When a request warns, then looks stuck: after 2 and 6 minutes, unless
// its kind takes longer when working normally.
const DEFAULT_REQUEST_ACTIVITY_THRESHOLDS: RequestActivityThresholds = { warnMs: 2 * 60 * 1000, criticalMs: 6 * 60 * 1000 };
const REQUEST_ACTIVITY_THRESHOLDS: Partial<Record<RequestActivityKey, RequestActivityThresholds>> = {
  // Up to 30 PRs refreshed one at a time: several minutes is normal.
  olderMerged: { warnMs: 10 * 60 * 1000, criticalMs: 20 * 60 * 1000 },
};

// The scheduler fields this Provider reads.
type SchedulerState = Parameters<RequestActivityValue['renderSchedulerStatus']>[0];

interface ActivityState {
  // In-flight count and when the oldest in-flight request of each kind
  // started (0 when none).
  counters: Record<string, number>;
  startedAtMs: Record<string, number>;
  recentEntries: RecentRequestActivity[];
}

const createDefaultActivityState = (): ActivityState => ({
  counters: Object.fromEntries(REQUEST_ACTIVITY_KEYS.map((key) => [key, 0])),
  startedAtMs: Object.fromEntries(REQUEST_ACTIVITY_KEYS.map((key) => [key, 0])),
  recentEntries: [],
});

// Each kind with a request in flight, in a fixed order. Iterates every
// known kind generically rather than one hand-written branch per key (a
// hand-written-branch shape once silently dropped the "labelApply" key).
const buildActiveRequests = (activityState: ActivityState): ActiveRequestActivity[] =>
  REQUEST_ACTIVITY_KEYS.filter((key) => (activityState.counters[key] ?? 0) > 0).map((key) => ({
    key,
    label: REQUEST_ACTIVITY_LABELS[key],
    count: activityState.counters[key] ?? 0,
    startedAtMs: activityState.startedAtMs[key] ?? 0,
    thresholds: REQUEST_ACTIVITY_THRESHOLDS[key] || DEFAULT_REQUEST_ACTIVITY_THRESHOLDS,
  }));

/**
 * Owns request activity: the requests in flight from this tab (each kind's
 * count and start, for the activity popover's "Now") and the recent
 * finished ones.
 *
 * Mounted above BackfillStatusProvider, AutoRenderBlockingProvider and
 * PrDataProvider in react-app.tsx and needing no other Context, so all of
 * them - and the action hooks - can read it directly.
 *
 * renderSchedulerStatus (called from JobEventsProvider's SSE frames and
 * useQuickCheckActions) announces the scheduler's active PRs with the
 * 'pr-active-progress-update' window event PrTableApp listens for.
 *
 * The active and recent lists are this Provider's own state, published on
 * RequestActivityDisplayContext (the activity popover reads them). The
 * bookkeeping itself stays a ref (it's mutated in place by every
 * begin/finish, read synchronously); only the derived lists are state. RequestActivityContext's value is
 * stable for this Provider's lifetime, so the many hooks that call these
 * functions never re-render because of them.
 *
 * `loadOnMount` (set by react-app.tsx, like PrDataProvider's) runs the startup
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
  const [activeRequests, setActiveRequests] = useState(() => buildActiveRequests(getActivityState()));
  const [recentRequestActivity, setRecentRequestActivity] = useState<RecentRequestActivity[]>([]);

  const renderRequestActivity = useCallback(() => {
    setActiveRequests(buildActiveRequests(activityRef.current as ActivityState));
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
      // And those a run of chosen PRs is still to fetch (shown "queued").
      const queuedPrNumbers = Array.isArray(scheduler.queuedPrNumbers) ? scheduler.queuedPrNumbers : [];
      // And what couldn't be refreshed (absent from an older server).
      const { refreshFailures, unreachablePrs } = scheduler as { refreshFailures?: unknown; unreachablePrs?: unknown };
      window.dispatchEvent(
        new CustomEvent('pr-active-progress-update', { detail: { activePrNumbers, queuedPrNumbers, refreshFailures, unreachablePrs } }),
      );
    },
    [],
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
    () => ({ activeRequests, recentRequestActivity }),
    [activeRequests, recentRequestActivity],
  );

  return (
    <RequestActivityContext.Provider value={actions}>
      <RequestActivityDisplayContext.Provider value={display}>{children}</RequestActivityDisplayContext.Provider>
    </RequestActivityContext.Provider>
  );
}
