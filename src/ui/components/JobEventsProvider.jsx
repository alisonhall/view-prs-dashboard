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
 * exists for the page even as more consumers are added later (the drawer
 * today, #scheduler-badges as a follow-up - see the plan's "Polling
 * retirement" section), the same reasoning NotesDirtyProvider documents
 * for owning genuinely shared state rather than letting each consumer
 * re-derive it.
 *
 * Also responsible for retiring the old scheduler poll: on every frame it
 * receives (snapshot/job/scheduler), it calls window.renderSchedulerStatus
 * with the bundled scheduler object - the exact function the old 30s
 * /view-prs/scheduler poll used to call, just re-triggered by push instead
 * of a timer. And on an autoRefresh/mergedQueueDrain "finish" job event, it
 * calls window.pollForDataChanges immediately rather than waiting for that
 * poll's own next tick - see the plan's reasoning for why that poll itself
 * can't be fully retired (it's the only signal for cross-tab mutations).
 */
export function JobEventsProvider({ children }) {
  const [jobEventsState, setJobEventsState] = useState(getInitialJobEventsState);
  const [isStale, setIsStale] = useState(false);
  const lastEventAtRef = useRef(null);
  lastEventAtRef.current = jobEventsState.lastEventAt;
  // Last real scheduler object received from any frame - kept so the
  // "connection just went down" effect below can still re-render
  // #scheduler-badges (with isLive: false) using real data, not nothing.
  const lastSchedulerRef = useRef(null);

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
      if (scheduler) {
        lastSchedulerRef.current = scheduler;
      }
      window.renderSchedulerStatus?.(scheduler, { isLive: true });
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
      if (isDataWritingJobFinish) {
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

  // Resilience follow-up: once SSE fully replaced the old scheduler poll,
  // #scheduler-badges/details-text had no fallback left if the connection
  // ever failed (a buffering proxy, an unsupported browser, a blocked
  // route) - they'd just freeze with no visible indication outside the
  // drawer, since the drawer's own connection banner only renders while a
  // user has it open. Whenever the connection isn't genuinely live, re-render
  // the last known scheduler object with isLive: false so that surface
  // stays honest about being stale instead of silently going quiet. The
  // reverse transition (back to live) doesn't need its own effect here -
  // the next real frame arrives almost immediately on reconnect and calls
  // applySchedulerSideEffects with isLive: true through the normal path.
  useEffect(() => {
    const isLive = jobEventsState.connection === 'open' && !isStale;
    if (isLive || !lastSchedulerRef.current) {
      return;
    }
    window.renderSchedulerStatus?.(lastSchedulerRef.current, { isLive: false });
  }, [jobEventsState.connection, isStale]);

  const value = useMemo(
    () => ({ ...jobEventsState, isStale }),
    [jobEventsState, isStale],
  );

  return <JobEventsContext.Provider value={value}>{children}</JobEventsContext.Provider>;
}
