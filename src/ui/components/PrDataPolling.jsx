/**
 * PrDataPolling - headless component (renders nothing) that owns the
 * remaining auto-refresh polling intervals for the PR data/backfill tabs
 * and the "request in progress" activity indicator.
 *
 * Track C, slice C1 (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * this replaces index.page.js's own setInterval calls plus its
 * cleanupIntervals/restartIntervals functions and the visibilitychange/
 * beforeunload listeners that paused/resumed them - same behavior,
 * ported 1:1, just now owned by React instead of a classic script. The
 * polled functions themselves (pollForDataChanges/pollBackfillStatus/
 * renderRequestActivity) are unchanged and still live in index.page.js -
 * only *when* they run moved, via window.pollForDataChanges/
 * pollBackfillStatus/renderRequestActivity (and
 * window.AUTO_DATA_POLL_MS/AUTO_BACKFILL_POLL_MS for the interval timing)
 * that index.page.js now exposes for this purpose. Moving the polled
 * functions' own logic into React is a later Track C slice, not this one.
 *
 * The scheduler-status poll this component used to also own
 * (schedulerInterval, calling window.pollSchedulerStatus) was retired by
 * the activity-drawer feature (see REACT_MIGRATION_PLAN.md's "Polling
 * retirement" section): JobEventsProvider.jsx's SSE connection now drives
 * the same window.renderSchedulerStatus rendering directly, so a separate
 * 30s fetch for it is no longer needed. window.pollSchedulerStatus itself
 * stays callable (index.html.test.js calls it directly) - only this
 * component's automatic interval was removed.
 *
 * Mounted once as a headless React root (see react-app.jsx's
 * mountPrDataPolling) - it renders null, so it doesn't need a specific
 * DOM container the way every other Phase 1-3 conversion did.
 *
 * @module components/PrDataPolling
 */

import { useEffect } from 'react';

const ACTIVITY_RENDER_MS = 1000;

export function PrDataPolling() {
  useEffect(() => {
    const dataPollMs = window.AUTO_DATA_POLL_MS || 30000;
    const backfillPollMs = window.AUTO_BACKFILL_POLL_MS || 5000;

    let dataInterval = null;
    let backfillInterval = null;
    let activityInterval = null;

    const startIntervals = () => {
      dataInterval = setInterval(() => window.pollForDataChanges?.(), dataPollMs);
      backfillInterval = setInterval(() => window.pollBackfillStatus?.(), backfillPollMs);
      activityInterval = setInterval(() => window.renderRequestActivity?.(), ACTIVITY_RENDER_MS);
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
  }, []);

  return null;
}
