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
 * window.pollForDataChanges indirection for this call site, the actual
 * goal of that phase. pollBackfillStatus/renderRequestActivity stay
 * window.* bridges (index.page.js) - deliberately out of scope for that
 * same slice (see its own writeup for why: both are tied to shared
 * vanilla state well beyond polling). window.AUTO_DATA_POLL_MS/
 * AUTO_BACKFILL_POLL_MS (the interval timing) are still exposed by
 * index.page.js the same way.
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
import { usePrData } from '../state/PrDataContext';

const ACTIVITY_RENDER_MS = 1000;

export function PrDataPolling() {
  // Phase F (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // pollForDataChanges is now built by <PrDataProvider /> itself (this
  // component's own parent - see react-app.jsx) and reached directly via
  // Context, not window.pollForDataChanges - the one piece of this
  // component's own polling that moved. pollBackfillStatus/
  // renderRequestActivity stay window.* bridges (out of scope for this
  // slice - see REACT_MIGRATION_PLAN.md's own Phase F entry for why).
  const { pollForDataChanges } = usePrData();

  useEffect(() => {
    const dataPollMs = window.AUTO_DATA_POLL_MS || 30000;
    const backfillPollMs = window.AUTO_BACKFILL_POLL_MS || 5000;

    let dataInterval = null;
    let backfillInterval = null;
    let activityInterval = null;

    const startIntervals = () => {
      dataInterval = setInterval(() => pollForDataChanges?.(), dataPollMs);
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
  }, [pollForDataChanges]);

  return null;
}
