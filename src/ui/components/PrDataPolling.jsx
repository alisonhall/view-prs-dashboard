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
 * pollBackfillStatus/renderRequestActivity now live in <PrDataProvider />
 * too, reached the same way - window.pollBackfillStatus/
 * window.renderRequestActivity had no caller left besides this component
 * once that happened, so both bridges were deleted outright (not kept
 * "for tests" - neither had a test dependency to begin with).
 * window.AUTO_DATA_POLL_MS/AUTO_BACKFILL_POLL_MS (the interval timing)
 * are still exposed by index.page.js the same way.
 *
 * The scheduler-status poll this component used to also own
 * (schedulerInterval, calling window.pollSchedulerStatus) was retired by
 * the activity-drawer feature (see REACT_MIGRATION_PLAN.md's "Polling
 * retirement" section): JobEventsProvider.jsx's SSE connection now drives
 * the same window.renderSchedulerStatus rendering directly, so a separate
 * 30s fetch for it is no longer needed. Phase H.2 (see
 * REACT_MIGRATION_PLAN.md) deleted window.pollSchedulerStatus/
 * PrDataProvider.jsx's own pollSchedulerStatus outright too, once
 * index.html.test.js's one remaining direct call (its only caller left)
 * was rewritten to call window.renderSchedulerStatus directly instead -
 * the same real path SSE already uses.
 *
 * Mounted once as a headless React root (see react-app.jsx's
 * mountPrDataPolling) - it renders null, so it doesn't need a specific
 * DOM container the way every other Phase 1-3 conversion did.
 *
 * Phase H.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * also mounted in index.html.test.js's own harness now (MountedPrTableTree),
 * so that suite's data-polling tests can drive pollForDataChanges through
 * this component's real setInterval (via fake timers) instead of calling
 * window.pollForDataChanges directly.
 *
 * @module components/PrDataPolling
 */

import { useEffect } from 'react';
import { usePrData } from '../state/PrDataContext';

const ACTIVITY_RENDER_MS = 1000;

export function PrDataPolling() {
  // Phase F/F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // pollForDataChanges/pollBackfillStatus/renderRequestActivity are all
  // built by <PrDataProvider /> itself (this component's own parent - see
  // react-app.jsx) and reached directly via Context now, not window.*.
  const { pollForDataChanges, pollBackfillStatus, renderRequestActivity } = usePrData();

  useEffect(() => {
    const dataPollMs = window.AUTO_DATA_POLL_MS || 30000;
    const backfillPollMs = window.AUTO_BACKFILL_POLL_MS || 5000;

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
  }, [pollForDataChanges, pollBackfillStatus, renderRequestActivity]);

  return null;
}
