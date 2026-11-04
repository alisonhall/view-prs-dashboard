import { useId } from 'react';
import { Button, IconButton } from '../ui/Button';
import { BackfillBadges } from '../BackfillBadges';
import { ActivityDrawerSchedulerSection } from '../ActivityDrawerSchedulerSection';
import { ActivityDrawerDispatcherSection } from '../ActivityDrawerDispatcherSection';
import { ActivityDrawerCircuitBreakerSection } from '../ActivityDrawerCircuitBreakerSection';
import { ActivityDrawerQueueSection } from '../ActivityDrawerQueueSection';
import { ActivityDrawerRecentActivitySection } from '../ActivityDrawerRecentActivitySection';
import { useBackfillStatus } from '../../state/BackfillStatusContext';
import { useJobEvents } from '../../state/JobEventsContext';
import { usePrActivityQueue } from '../../state/PrActivityQueueContext';
import { useRequestActivityDisplay } from '../../state/RequestActivityContext';
import { useActivityDrawerActions } from '../../state/useActivityDrawerActions';
import { useHeaderPopover } from './useHeaderPopover';

/**
 * The app header's Activity button and its popover (UI_REDESIGN_PLAN.md,
 * phase 9c): all background activity in one place - scheduled jobs (live,
 * via SSE), the dispatcher queue, the circuit breaker, bulk batches,
 * backfill and in-flight requests from this tab (their existing polls), and
 * what just finished. The button shows how many jobs are running and bulk
 * chunks queued.
 *
 * A header popover (useHeaderPopover), which its close button closes too.
 * Opening focuses the popover itself (not its close button, whose tooltip
 * would take the first Esc). Its content mounts only while open.
 */
export function ActivityPopover() {
  const titleId = useId();
  const panelId = useId();
  const { isOpen, open, close, buttonRef, panelRef, panelStyle } = useHeaderPopover();
  const { jobs } = useJobEvents();
  const { bulkBatches } = usePrActivityQueue();
  const { backfillBadges, backfillDetailsText } = useBackfillStatus();
  const { requestActivityBadges, recentRequestActivity } = useRequestActivityDisplay();
  const { handleDispatcherBump, handleResetCircuitBreaker } = useActivityDrawerActions();

  const runningJobCount = Object.values(jobs).filter((job) => job.status === 'running').length;
  // Chunks still waiting or in flight across every tracked bulk batch (see
  // ActivityDrawerQueueSection).
  const queuedChunkCount = bulkBatches.reduce((sum, batch) => sum + (batch.totalChunks - batch.doneCount - batch.failedCount), 0);
  const activityCount = runningJobCount + queuedChunkCount;

  return (
    <>
      <Button
        ref={buttonRef}
        icon="pulse"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={activityCount > 0 ? `Activity, ${activityCount} running or queued` : undefined}
        onClick={() => (isOpen ? close(false) : open())}
      >
        Activity
        {activityCount > 0 && (
          <span className="app-header-count" aria-hidden="true">
            {activityCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div ref={panelRef} id={panelId} className="activity-popover" role="dialog" aria-labelledby={titleId} tabIndex={-1} style={panelStyle}>
          <div className="activity-popover-header">
            <h2 id={titleId} className="activity-popover-title">
              Activity
            </h2>
            <IconButton icon="close" label="Close activity" tooltipPlacement="bottom" onClick={() => close(true)} />
          </div>

          <div className="activity-popover-content">
            <ActivityDrawerSchedulerSection />

            <ActivityDrawerDispatcherSection onBump={handleDispatcherBump} />

            <ActivityDrawerCircuitBreakerSection onReset={handleResetCircuitBreaker} />

            <ActivityDrawerQueueSection />

            <section className="activity-drawer-section">
              <h3 className="activity-drawer-section-title">Backfill</h3>
              <p className="activity-drawer-section-caption">Polled every 5s.</p>
              <div className="activity-drawer-badges">
                <BackfillBadges badges={backfillBadges.badges} />
              </div>
              {backfillDetailsText && <pre className="activity-drawer-details-text">{backfillDetailsText}</pre>}
            </section>

            <section className="activity-drawer-section">
              <h3 className="activity-drawer-section-title">In-flight user actions</h3>
              <p className="activity-drawer-section-caption">Requests started from this browser tab.</p>
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
