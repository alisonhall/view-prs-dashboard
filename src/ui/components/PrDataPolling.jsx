/**
 * PrDataPolling - headless component (renders nothing) that owns the
 * remaining auto-refresh polling intervals for the PR data/backfill tabs
 * and the "request in progress" activity indicator.
 *
 * Track C, slice C1 (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * this replaces index.page.js's own setInterval calls plus its
 * cleanupIntervals/restartIntervals functions and the visibilitychange/
 * beforeunload listeners that paused/resumed them - same behavior,
 * ported 1:1, just now owned by React instead of a classic script.
 *
 * Phase F (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * pollForDataChanges itself now lives in <PrDataProvider /> (this
 * component's own parent), reached directly via usePrData() - no more
 * window.pollForDataChanges indirection for this call site.
 *
 * Phase F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * pollBackfillStatus moved into <PrDataProvider /> too, reached the same
 * way. renderRequestActivity is <RequestActivityProvider />'s since
 * window-bridge elimination Phase 7.3, read with useRequestActivity(). The
 * interval timing is this module's own constants (index.page.js used to
 * publish it as window.AUTO_DATA_POLL_MS/AUTO_BACKFILL_POLL_MS), with an
 * optional `?dataPollMs=` page-URL override for the data poll - see
 * readDataPollMsOverride below.
 *
 * The scheduler-status poll this component used to also own
 * (schedulerInterval, calling window.pollSchedulerStatus) was retired by
 * the activity-drawer feature (see REACT_MIGRATION_PLAN.md's "Polling
 * retirement" section): JobEventsProvider.jsx's SSE connection drives the
 * scheduler rendering directly (RequestActivityProvider's
 * renderSchedulerStatus, via Context since window-bridge elimination Phase
 * 7.3), so a separate 30s fetch for it is no longer needed.
 *
 * Mounted once by react-app.jsx's mountAppRoot(), as AppRoot's sibling
 * inside PrDataProvider - it renders null, so it doesn't need a DOM
 * container.
 *
 * Phase H.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * also mounted in index.html.test.js's own harness now (inside
 * FilterStateTestRootHarness's PrDataProvider), so that suite's data-polling
 * tests drive pollForDataChanges through this component's real setInterval
 * (via fake timers). The window.pollForDataChanges bridge they used to call
 * was deleted in window-bridge elimination Phase 7.
 *
 * @module components/PrDataPolling
 */

import { useEffect } from 'react';
import { usePrData } from '../state/PrDataContext';
import { useRequestActivity } from '../state/RequestActivityContext';

const ACTIVITY_RENDER_MS = 1000;
// Window-bridge elimination Phase 7.3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// plain constants here now; index.page.js used to publish them as
// window.AUTO_DATA_POLL_MS/AUTO_BACKFILL_POLL_MS, and this was their only reader.
export const AUTO_DATA_POLL_MS = 30000;
export const AUTO_BACKFILL_POLL_MS = 5000;
// Floor for the override below, so a typo can't make the page hammer the
// server.
export const MIN_DATA_POLL_MS = 100;

// A `dataPollMs` query parameter on the page URL (e.g. `/?dataPollMs=300`)
// shortens the data poll. For tooling: `npm run stability:heap-check` needs
// the page to fetch each server data change within seconds, not 30s, and used
// to get that by pinning window.AUTO_DATA_POLL_MS, a global window-bridge
// elimination Phase 7.3 deleted.
// Returns undefined (use the default) unless it's a whole number of ms >=
// MIN_DATA_POLL_MS. mountAppRoot() reads it once and passes it as a prop.
export function readDataPollMsOverride(search) {
  const raw = new URLSearchParams(search || '').get('dataPollMs');
  if (raw === null || !/^\d+$/.test(raw)) {
    return undefined;
  }
  const value = Number(raw);
  return value >= MIN_DATA_POLL_MS ? value : undefined;
}

export function PrDataPolling({ dataPollMs = AUTO_DATA_POLL_MS }) {
  // Phase F/F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // pollForDataChanges/pollBackfillStatus/renderRequestActivity are all
  // built by <PrDataProvider /> itself (this component's own parent - see
  // react-app.jsx) and reached directly via Context now, not window.*.
  // Window-bridge elimination Phase 7.3: renderRequestActivity is
  // RequestActivityProvider's now (an ancestor of PrDataProvider).
  const { pollForDataChanges, pollBackfillStatus } = usePrData();
  const { renderRequestActivity } = useRequestActivity();

  useEffect(() => {
    const backfillPollMs = AUTO_BACKFILL_POLL_MS;

    let dataInterval = null;
    let backfillInterval = null;
    let activityInterval = null;

    const startIntervals = () => {
      dataInterval = setInterval(() => pollForDataChanges?.(), dataPollMs);
      backfillInterval = setInterval(() => pollBackfillStatus?.(), backfillPollMs);
      activityInterval = setInterval(() => renderRequestActivity?.(), ACTIVITY_RENDER_MS);
    };

    const stopIntervals = () => {
      if (dataInterval) {
        clearInterval(dataInterval);
        dataInterval = null;
      }
      if (backfillInterval) {
        clearInterval(backfillInterval);
        backfillInterval = null;
      }
      if (activityInterval) {
        clearInterval(activityInterval);
        activityInterval = null;
      }
    };

    startIntervals();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopIntervals();
      } else {
        startIntervals();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', stopIntervals);

    return () => {
      stopIntervals();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', stopIntervals);
    };
  }, [pollForDataChanges, pollBackfillStatus, renderRequestActivity, dataPollMs]);

  return null;
}
