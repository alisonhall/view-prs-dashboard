import { useEffect, useMemo, useRef, useState } from 'react';
import { JobEventsContext } from '../state/JobEventsContext';
import { createPrJobEventsHelpers } from '../helpers/pr-job-events.helpers.js';

const STALENESS_CHECK_INTERVAL_MS = 30000;
const STALENESS_THRESHOLD_MS = 60000;
const RECONNECT_BASE_DELAY_MS = 3000;
const RECONNECT_MAX_DELAY_MS = 30000;

const {
  getInitialJobEventsState,
  setConnectionState,
  applyJobEventsSnapshot,
  applyJobEvent,
} = createPrJobEventsHelpers();

/**
 * Activity drawer feature (see REACT_MIGRATION_PLAN.md): owns the single
 * EventSource connection to GET /view-prs/events and exposes the resulting
 * job state via JobEventsContext.
 *
 * A Provider (not a bare hook) deliberately - so exactly one EventSource
 * exists for the page even as more consumers are added later, the same
 * reasoning NotesDirtyProvider documents for owning genuinely shared state
 * rather than letting each consumer re-derive it.
 *
 * On every frame it receives (snapshot/job/scheduler/data-changed), it calls
 * window.renderSchedulerStatus with the bundled scheduler object - that
 * function's only remaining job (since #scheduler-badges/#scheduler-details
 * were removed as redundant with this drawer's own live display) is keeping
 * the per-row progress indicator and #request-activity-badges current, both
 * independent of this drawer's own UI. And on an autoRefresh/
 * mergedQueueDrain "finish" job event, OR a "data-changed" event (fired by
 * ack/apply-label/manual-run/request-more once one of those routes actually
 * wrote to the stored PR data file), it calls window.pollForDataChanges
 * immediately rather than waiting for that poll's own next tick - the
 * interval itself stays as a slower safety net, since not every possible
 * write path is instrumented (e.g. anything that bypasses these routes
 * entirely would still rely on it).
 */
export function JobEventsProvider({ children }) {
  const [jobEventsState, setJobEventsState] = useState(getInitialJobEventsState);
  const [isStale, setIsStale] = useState(false);
  const lastEventAtRef = useRef(null);
  lastEventAtRef.current = jobEventsState.lastEventAt;

  useEffect(() => {
    if (typeof window.EventSource !== 'function') {
      setJobEventsState((previous) => setConnectionState(previous, 'unsupported'));
      return undefined;
    }

    let eventSource = null;
    let reconnectTimer = null;
    let reconnectDelayMs = RECONNECT_BASE_DELAY_MS;
    let stopped = false;

    const applySchedulerSideEffects = (scheduler) => {
      window.renderSchedulerStatus?.(scheduler);
    };

    const handleSnapshot = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch (_error) {
        return;
      }
      setJobEventsState((previous) => applyJobEventsSnapshot(previous, payload));
      applySchedulerSideEffects(payload?.scheduler);
    };

    const handleJobOrSchedulerFrame = (event) => {
      let envelope;
      try {
        envelope = JSON.parse(event.data);
      } catch (_error) {
        return;
      }
      setJobEventsState((previous) => applyJobEvent(previous, envelope));
      applySchedulerSideEffects(envelope?.scheduler);

      const isDataWritingJobFinish =
        envelope?.phase === 'finish' &&
        (envelope?.job === 'autoRefresh' || envelope?.job === 'mergedQueueDrain');
      // "data-changed" (see REACT_MIGRATION_PLAN.md's poll-conversion
      // follow-up): emitted by ack/apply-label/manual-run/request-more once
      // one of those routes has actually written to the stored PR data file
      // - the requesting tab already has its own fresh result from that
      // route's own response, so this is specifically for every *other*
      // connected tab.
      const isDataChangedEvent = envelope?.type === 'data-changed';
      if (isDataWritingJobFinish || isDataChangedEvent) {
        window.pollForDataChanges?.();
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
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      eventSource?.close();
    };
    // Deliberately no visibilitychange handling here, unlike
    // PrDataPolling.jsx - an idle SSE connection costs nothing server-side,
    // and closing/reopening it on every tab switch would just cause
    // reconnect churn for no benefit.
  }, []);

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

  const value = useMemo(
    () => ({ ...jobEventsState, isStale }),
    [jobEventsState, isStale],
  );

  return <JobEventsContext.Provider value={value}>{children}</JobEventsContext.Provider>;
}
