import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { JobEventsContext, type JobEventsValue } from '../state/JobEventsContext';
import { PrDataContext } from '../state/PrDataContext';
import { useRequestActivity, type RequestActivityValue } from '../state/RequestActivityContext';
import {
  createPrJobEventsHelpers,
  type JobEventEnvelope,
  type JobEventsState,
  type SchedulerSnapshot,
} from '../helpers/pr-job-events.helpers.ts';

const STALENESS_CHECK_INTERVAL_MS = 30000;
const STALENESS_THRESHOLD_MS = 60000;
const RECONNECT_BASE_DELAY_MS = 3000;
const RECONNECT_MAX_DELAY_MS = 30000;

const {
  getInitialJobEventsState,
  setConnectionState,
  applyJobEventsSnapshot,
  applyJobEvent,
  extractSchedulerSummary,
} = createPrJobEventsHelpers();

// A job/scheduler frame, or a "data-changed" frame (which carries `type`).
type JobEventsFrame = JobEventEnvelope & { type?: string };

/**
 * Owns the single EventSource connection to GET /view-prs/events and
 * exposes the resulting job state via JobEventsContext.
 *
 * A Provider (not a bare hook) deliberately - so exactly one EventSource
 * exists for the page however many consumers read it.
 *
 * On every frame it receives (snapshot/job/scheduler/data-changed), it calls
 * RequestActivityProvider's renderSchedulerStatus with the bundled
 * scheduler object, which keeps the per-row progress indicator and the
 * request-activity badges current. And on an autoRefresh/mergedQueueDrain/
 * quickCheck "finish" job event, OR a "data-changed" event (fired by ack/
 * apply-label/manual-run/request-more once one of those routes actually
 * wrote to the stored PR data file, and by the server's data watcher when
 * the data version moves), it calls PrDataContext's pollForDataChanges
 * immediately - one at a time - rather than waiting for that poll's own
 * next tick, and on each connection's snapshot (the server only pushes
 * changes from when a connection opens). The interval itself stays as a
 * slower safety net (PrDataPolling slows it while this connection is open).
 */
export function JobEventsProvider({ children }: { children?: ReactNode }) {
  // Reads PrDataContext directly (not the throwing usePrData() hook) so
  // this still works without a <PrDataProvider> ancestor - this
  // component's own existing test file mounts it standalone, and payload
  // is only used below as an optional seed (see the schedulerSummary
  // useMemo's own comment), never required for this Provider's main job
  // (owning the EventSource connection).
  const prDataContext = useContext(PrDataContext);
  const payload = prDataContext?.payload;
  // Ref, not an effect dependency: the SSE effect below must not tear down
  // and reconnect the EventSource if PrDataProvider ever rebuilds this
  // function's identity.
  const pollForDataChangesRef = useRef<(() => Promise<void>) | undefined>(undefined);
  pollForDataChangesRef.current = prDataContext?.pollForDataChanges;
  // Same ref reasoning. Stable anyway (RequestActivityProvider's value never
  // changes), and the inert default without a Provider is a no-op.
  const renderSchedulerStatusRef = useRef<RequestActivityValue['renderSchedulerStatus'] | null>(null);
  renderSchedulerStatusRef.current = useRequestActivity().renderSchedulerStatus;
  const [jobEventsState, setJobEventsState] = useState<JobEventsState>(getInitialJobEventsState);
  const [isStale, setIsStale] = useState(false);
  // The first snapshot's poll waits for the page's first data load: a poll
  // before it would load all the data a second time.
  const isPayloadLoaded = Boolean(payload?.ok);
  const isPayloadLoadedRef = useRef(isPayloadLoaded);
  isPayloadLoadedRef.current = isPayloadLoaded;
  const pollWhenLoadedRef = useRef(false);
  const requestDataPollRef = useRef<(() => void) | null>(null);
  const lastEventAtRef = useRef<string | null>(null);
  lastEventAtRef.current = jobEventsState.lastEventAt;

  useEffect(() => {
    if (typeof window.EventSource !== 'function') {
      setJobEventsState((previous) => setConnectionState(previous, 'unsupported'));
      return undefined;
    }

    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelayMs = RECONNECT_BASE_DELAY_MS;
    let stopped = false;

    // One data poll at a time: frames can come every few seconds during a
    // run (the server's data watcher), and a poll can take longer than that.
    // A request while one's running runs once more after it.
    let isPolling = false;
    let pollAgain = false;
    const requestDataPoll = () => {
      if (isPolling) {
        pollAgain = true;
        return;
      }
      isPolling = true;
      Promise.resolve(pollForDataChangesRef.current?.())
        .catch(() => {})
        .finally(() => {
          isPolling = false;
          if (pollAgain && !stopped) {
            pollAgain = false;
            requestDataPoll();
          }
        });
    };
    requestDataPollRef.current = requestDataPoll;

    const applySchedulerSideEffects = (scheduler: SchedulerSnapshot | undefined) => {
      renderSchedulerStatusRef.current?.(scheduler);
    };

    const handleSnapshot = (event: MessageEvent) => {
      let payload: { scheduler?: SchedulerSnapshot; at?: string };
      try {
        payload = JSON.parse(event.data);
      } catch (_error) {
        return;
      }
      setJobEventsState((previous) => applyJobEventsSnapshot(previous, payload));
      applySchedulerSideEffects(payload?.scheduler);
      // Whatever changed before this connection opened wasn't pushed: while
      // disconnected, or, on the first one, since the page's data load began.
      if (isPayloadLoadedRef.current) {
        requestDataPoll();
      } else {
        pollWhenLoadedRef.current = true;
      }
    };

    const handleJobOrSchedulerFrame = (event: MessageEvent) => {
      let envelope: JobEventsFrame;
      try {
        envelope = JSON.parse(event.data);
      } catch (_error) {
        return;
      }
      setJobEventsState((previous) => applyJobEvent(previous, envelope));
      applySchedulerSideEffects(envelope?.scheduler);

      const isDataWritingJobFinish =
        envelope?.phase === 'finish' &&
        (envelope?.job === 'autoRefresh' || envelope?.job === 'mergedQueueDrain' || envelope?.job === 'quickCheck');
      // "data-changed" is emitted by ack/apply-label/manual-run/request-more
      // once one of those routes has actually written to the stored PR data
      // file - the requesting tab already has its own fresh result from that
      // route's own response, so this is specifically for every *other*
      // connected tab - and by the server's data watcher whenever the data
      // version moves (a script run's rows, a quick check's listing).
      const isDataChangedEvent = envelope?.type === 'data-changed';
      if (isDataWritingJobFinish || isDataChangedEvent) {
        requestDataPoll();
      }
    };

    const connect = () => {
      if (stopped) {
        return;
      }
      eventSource = new window.EventSource('/view-prs/events');

      eventSource.onopen = () => {
        reconnectDelayMs = RECONNECT_BASE_DELAY_MS;
        setJobEventsState((previous) => setConnectionState(previous, 'open'));
      };

      eventSource.addEventListener('snapshot', handleSnapshot);
      eventSource.addEventListener('job', handleJobOrSchedulerFrame);
      eventSource.addEventListener('scheduler', handleJobOrSchedulerFrame);
      eventSource.addEventListener('data-changed', handleJobOrSchedulerFrame);

      eventSource.onerror = () => {
        if (stopped) {
          return;
        }
        if (eventSource && eventSource.readyState === window.EventSource.CONNECTING) {
          // Browser is already auto-retrying this same connection.
          setJobEventsState((previous) => setConnectionState(previous, 'reconnecting'));
          return;
        }

        // readyState === CLOSED (e.g. a 503/404 response) - the browser
        // will not retry on its own, so this component owns reconnecting.
        setJobEventsState((previous) => setConnectionState(previous, 'offline'));
        eventSource?.close();
        reconnectTimer = setTimeout(() => {
          reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_DELAY_MS);
          connect();
        }, reconnectDelayMs);
      };
    };

    connect();

    return () => {
      stopped = true;
      requestDataPollRef.current = null;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      eventSource?.close();
    };
    // Deliberately no visibilitychange handling here, unlike
    // PrDataPolling.tsx - an idle SSE connection costs nothing server-side,
    // and closing/reopening it on every tab switch would just cause
    // reconnect churn for no benefit.
  }, []);

  useEffect(() => {
    if (isPayloadLoaded && pollWhenLoadedRef.current) {
      pollWhenLoadedRef.current = false;
      requestDataPollRef.current?.();
    }
  }, [isPayloadLoaded]);

  useEffect(() => {
    const watchdog = setInterval(() => {
      const lastEventAt = lastEventAtRef.current;
      if (!lastEventAt) {
        return;
      }
      const elapsedMs = Date.now() - Date.parse(lastEventAt);
      setIsStale(elapsedMs > STALENESS_THRESHOLD_MS);
    }, STALENESS_CHECK_INTERVAL_MS);
    return () => clearInterval(watchdog);
  }, []);

  // schedulerSummary's own default value (getInitialJobEventsState) is a
  // hardcoded placeholder ({ intervalMinutes: 15, lastAutoRunAt: null,
  // ... }), not real data - on a fresh page load, before this
  // connection's first real 'snapshot' event arrives, consumers would
  // otherwise briefly see that placeholder instead of whatever's actually
  // true (e.g. "Last auto: -" even if an auto run genuinely happened
  // recently). payload.scheduler (PrDataProvider's own state, already
  // populated from the very first /view-prs/data fetch - the exact same
  // server-side getViewPrsSchedulerPublicState() this connection's own
  // scheduler frames carry) already has the real values immediately, so
  // prefer it as a fallback until lastSnapshotAt confirms this connection
  // has delivered real data of its own - from then on, the live
  // SSE-tracked value is preferred (fresher between polls, the whole
  // point of this connection existing).
  const schedulerSummary = useMemo(() => {
    if (jobEventsState.lastSnapshotAt) {
      return jobEventsState.schedulerSummary;
    }
    return extractSchedulerSummary(payload?.scheduler as SchedulerSnapshot | undefined, jobEventsState.schedulerSummary);
  }, [jobEventsState.lastSnapshotAt, jobEventsState.schedulerSummary, payload]);

  const value = useMemo<JobEventsValue>(
    () => ({ ...jobEventsState, schedulerSummary, isStale }),
    [jobEventsState, schedulerSummary, isStale],
  );

  return <JobEventsContext.Provider value={value}>{children}</JobEventsContext.Provider>;
}
