import { useEffect, useRef, useState } from 'react';
import { useJobEvents } from '../state/JobEventsContext';
import { usePrActivityQueue } from '../state/PrActivityQueueContext';
import { ActivityDrawerSchedulerSection } from './ActivityDrawerSchedulerSection';
import { ActivityDrawerDispatcherSection } from './ActivityDrawerDispatcherSection';
import { ActivityDrawerCircuitBreakerSection } from './ActivityDrawerCircuitBreakerSection';
import { ActivityDrawerQueueSection } from './ActivityDrawerQueueSection';
import { ActivityDrawerRecentActivitySection } from './ActivityDrawerRecentActivitySection';
import { BackfillBadges } from './BackfillBadges';

/**
 * Activity drawer feature (see REACT_MIGRATION_PLAN.md): a collapsible
 * panel surfacing all background activity in one place - scheduled jobs
 * (live, via SSE), backfill and in-flight user requests (both via their
 * existing polls, passed in as props from AppRoot so this component adds
 * no new fetch of its own).
 *
 * Collapsed by default, plain useState - not persisted to localStorage
 * (there is no existing localStorage usage anywhere in src/ui, and this
 * isn't important enough state to introduce that pattern for).
 *
 * Mounted once, always-present (see react-app.jsx), so the toggle's live
 * count stays accurate even while the panel itself is closed.
 */
export function ActivityDrawer({
  backfillBadges = [],
  backfillDetailsText = '',
  requestActivityBadges = [],
  recentRequestActivity = [],
  onBumpDispatcherEntry,
  onResetCircuitBreaker,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { jobs } = useJobEvents();
  const { bulkBatches } = usePrActivityQueue();
  const closeButtonRef = useRef(null);

  // Not a true modal (nothing behind it is inert, no focus trap) since the
  // panel is dismissable and non-blocking - but Escape-to-close and moving
  // focus onto the panel when it opens are cheap, expected affordances for
  // any keyboard user, so they're worth the few lines even without going
  // all the way to a full dialog pattern.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const runningJobCount = Object.values(jobs).filter((job) => job.status === 'running').length;
  // Chunks still waiting or in flight across every tracked bulk batch - see
  // ActivityDrawerQueueSection's own comment for why this is the one place
  // in the drawer a real queue position is shown.
  const queuedChunkCount = bulkBatches.reduce(
    (sum, batch) => sum + (batch.totalChunks - batch.doneCount - batch.failedCount),
    0,
  );
  const activityCount = runningJobCount + queuedChunkCount;

  return (
    <>
      <button
        type="button"
        className="activity-drawer-toggle"
        onClick={() => setIsOpen((previous) => !previous)}
        aria-expanded={isOpen}
      >
        Activity{activityCount > 0 ? ` (${activityCount})` : ''}
      </button>

      {isOpen && (
        <div className="activity-drawer-panel">
          <div className="activity-drawer-panel-header">
            <span className="activity-drawer-panel-title">Activity</span>
            <button
              type="button"
              ref={closeButtonRef}
              className="activity-drawer-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close activity panel"
            >
              ×
            </button>
          </div>

          <div className="activity-drawer-panel-content">
            <ActivityDrawerSchedulerSection />

            <ActivityDrawerDispatcherSection onBump={onBumpDispatcherEntry} />

            <ActivityDrawerCircuitBreakerSection onReset={onResetCircuitBreaker} />

            <ActivityDrawerQueueSection />

            <section className="activity-drawer-section">
              <h3 className="activity-drawer-section-title">Backfill</h3>
              <p className="activity-drawer-section-caption">Polled every 5s.</p>
              <div className="activity-drawer-badges">
                <BackfillBadges badges={backfillBadges} />
              </div>
              {backfillDetailsText && (
                <pre className="activity-drawer-details-text">{backfillDetailsText}</pre>
              )}
            </section>

            <section className="activity-drawer-section">
              <h3 className="activity-drawer-section-title">In-flight user actions</h3>
              <p className="activity-drawer-section-caption">
                Requests started from this browser tab.
              </p>
              <div className="activity-drawer-badges">
                <BackfillBadges badges={requestActivityBadges} />
              </div>
            </section>

            <ActivityDrawerRecentActivitySection recentRequestActivity={recentRequestActivity} />
          </div>
        </div>
      )}
    </>
  );
}
