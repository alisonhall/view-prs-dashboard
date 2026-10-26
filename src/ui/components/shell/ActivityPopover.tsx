import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Button, IconButton } from '../ui/Button';
import { computeMenuPosition } from '../ui/MenuButton';
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

const VIEWPORT_MARGIN_PX = 8;

/**
 * The app header's Activity button and its popover (UI_REDESIGN_PLAN.md,
 * phase 9c): all background activity in one place - scheduled jobs (live,
 * via SSE), the dispatcher queue, the circuit breaker, bulk batches,
 * backfill and in-flight requests from this tab (their existing polls), and
 * what just finished. The button shows how many jobs are running and bulk
 * chunks queued.
 *
 * A non-modal dialog under the button (fixed, kept in the window like the
 * row menu, following it on resize): Esc, its close button, a click or
 * focus moving outside it, or the page scrolling (the header isn't sticky,
 * so it would carry the popover off the top) closes it. Esc returns focus
 * to the button.
 * Opening focuses the popover itself (not its close button, whose tooltip
 * would take the first Esc). Its content mounts only while open.
 */
export function ActivityPopover() {
  const titleId = useId();
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
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

  const close = useCallback((returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  const place = useCallback(() => {
    const button = buttonRef.current;
    const panel = panelRef.current;
    if (!button || !panel) return;
    const next = computeMenuPosition(button.getBoundingClientRect(), panel.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    setPosition((previous) => (previous && previous.top === next.top && previous.left === next.left ? previous : next));
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return undefined;
    }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [isOpen, place]);

  // Focused once placed: until then it's visibility: hidden, which can't
  // take focus.
  const isPlaced = position !== null;
  useEffect(() => {
    if (isOpen && isPlaced) panelRef.current?.focus();
  }, [isOpen, isPlaced]);

  // Esc on window, so a true modal above (the PR JSON modal, listening on
  // document) can take it first and stop it here.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    const isInside = (target: EventTarget | null) =>
      target instanceof Node && Boolean(panelRef.current?.contains(target) || buttonRef.current?.contains(target));
    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event.target)) close(false);
    };
    // Focus moving to something else (Tab out to the Settings button, say).
    // Not the window losing focus (no relatedTarget): switching apps keeps
    // it open.
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget && !isInside(event.relatedTarget)) close(false);
    };
    // Scrolling the popover's own content keeps it open.
    const onScroll = (event: Event) => {
      if (!isInside(event.target)) close(false);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [isOpen, close]);

  const panelStyle: CSSProperties = position
    ? { top: position.top, left: position.left, maxHeight: `calc(100vh - ${position.top + VIEWPORT_MARGIN_PX}px)` }
    : { visibility: 'hidden' };

  return (
    <>
      <Button
        ref={buttonRef}
        icon="pulse"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={activityCount > 0 ? `Activity, ${activityCount} running or queued` : undefined}
        onClick={() => (isOpen ? close(false) : setIsOpen(true))}
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
