import { useEffect, useId, useRef, useState } from 'react';
import { Button, IconButton } from '../ui/Button';
import { useBackfillStatus } from '../../state/BackfillStatusContext';
import { useJobEvents } from '../../state/JobEventsContext';
import { NowProvider, useNow } from '../../state/NowContext';
import { usePrActivityQueue } from '../../state/PrActivityQueueContext';
import { useRequestActivityDisplay } from '../../state/RequestActivityContext';
import { useActivityDrawerActions } from '../../state/useActivityDrawerActions';
import { useSettingsDrawer } from '../../state/SettingsDrawerContext';
import {
  buildActivityFinished,
  buildActivityNow,
  buildActivityProblems,
  buildActivityUpNext,
  countActivity,
  describeActivityKind,
  ACTIVITY_KIND_GUIDE,
  type ActivityUpNextItem,
} from '../../helpers/pr-activity-view.helpers.ts';
import { useHeaderPopover } from './useHeaderPopover';

// How often the open popover's times ("40s", "in 6m", "2m ago") move on.
const ACTIVITY_TICK_MS = 5000;

const PRIORITY_HINT =
  'Priority decides which goes first when several are due at once (quick check 5, auto refresh 3, merged/closed drain 1, plus the repo\'s boost in Settings › Background updates).';
// What a long-running request's colour says, as its tooltip and for
// screen readers.
const SEVERITY_TEXT: Record<string, string | undefined> = {
  warning: 'Running longer than usual',
  critical: 'Running much longer than usual',
};
const RUN_NOW_HINT = "Runs it now instead of at its time. Its priority doesn't change, so another task due now may go first.";

// The problems the popover would show, for the button too.
function useActivityProblems() {
  const { openAutoCircuitRepos, connection, isStale } = useJobEvents();
  const { hasBackfillStatusError } = useBackfillStatus();
  return buildActivityProblems({
    openAutoCircuitRepos: Array.isArray(openAutoCircuitRepos) ? openAutoCircuitRepos : [],
    connection,
    isStale: Boolean(isStale),
    backfillStatusError: hasBackfillStatusError,
  });
}

// Guards a state update after the popover's content unmounts (closed while
// a request is still in flight).
function useIsMounted() {
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  return isMounted;
}

function ActivityContent({ onOpenActionLog }: { onOpenActionLog: (focus?: { kind: string; atMs: number }) => void }) {
  const nowMs = useNow();
  const { jobs, tasks, dispatcherQueue, pendingOpenCount, pendingMergedClosedCount, recentFinished } = useJobEvents();
  const { bulkBatches } = usePrActivityQueue();
  const { isBackfillRunning } = useBackfillStatus();
  const { activeRequests, recentRequestActivity } = useRequestActivityDisplay();
  const { handleDispatcherBump, handleResetCircuitBreaker } = useActivityDrawerActions();
  const problems = useActivityProblems();
  const isMounted = useIsMounted();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const now = buildActivityNow({ jobs, tasks, activeRequests, bulkBatches, isBackfillRunning, nowMs });
  const upNext = buildActivityUpNext({
    dispatcherQueue: Array.isArray(dispatcherQueue) ? dispatcherQueue : [],
    quickCheckWaitingOn: jobs.quickCheck.waitingOn?.job || null,
    pendingOpenCount,
    pendingMergedClosedCount,
    nowMs,
  });
  const finished = buildActivityFinished({ recentFinished, recentRequestActivity, jobs, nowMs });

  const runPending = async (key: string, action: () => unknown) => {
    setPendingKey(key);
    try {
      await action();
    } finally {
      if (isMounted.current) setPendingKey((previous) => (previous === key ? null : previous));
    }
  };
  const runNow = (item: ActivityUpNextItem) => runPending(item.key, () => handleDispatcherBump(item.repo || '', item.taskType || ''));

  return (
    <div className="activity-popover-content">
      {problems.length > 0 && (
        <section className="activity-section activity-problems" aria-label="Problems">
          <ul className="activity-list">
            {problems.map((problem) => (
              <li key={problem.key} className="activity-problem">
                <span>{problem.text}</span>
                {problem.canReset && (
                  <button
                    type="button"
                    className="activity-action"
                    disabled={pendingKey === problem.key}
                    onClick={() => runPending(problem.key, handleResetCircuitBreaker)}
                  >
                    {pendingKey === problem.key ? 'Resetting…' : 'Reset'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="activity-section" aria-labelledby="activity-now-title">
        <h3 id="activity-now-title" className="activity-section-title">
          Now
        </h3>
        {now.length === 0 ? (
          <p className="activity-empty">Nothing running.</p>
        ) : (
          <ul className="activity-list">
            {now.map((item) => (
              <li key={item.key} className="activity-item">
                <span className="activity-item-main">
                  <span className="activity-item-label" title={describeActivityKind(item.kind) || undefined}>
                    {item.label}
                  </span>
                  {item.detail && <span className="activity-item-detail">{item.detail}</span>}
                </span>
                <span className="activity-item-meta">
                  <span className="activity-origin" data-origin={item.origin}>
                    {item.origin === 'you' ? 'You' : 'Background'}
                  </span>
                  {item.elapsed && (
                    <span className="activity-elapsed" data-severity={item.severity || undefined} title={SEVERITY_TEXT[item.severity]}>
                      {item.elapsed}
                      {item.severity && <span className="ui-visually-hidden">, {SEVERITY_TEXT[item.severity]?.toLowerCase()}</span>}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {upNext.length > 0 && (
        <section className="activity-section" aria-labelledby="activity-next-title">
          <h3 id="activity-next-title" className="activity-section-title">
            Up next
          </h3>
          <ol className="activity-list">
            {upNext.map((item) => (
              <li key={item.key} className="activity-item">
                <span className="activity-item-main">
                  <span
                    className="activity-item-label"
                    title={[describeActivityKind(item.kind), item.priority !== undefined ? `Priority ${item.priority}. ${PRIORITY_HINT}` : ''].filter(Boolean).join('\n\n') || undefined}
                  >
                    {item.label}
                  </span>
                  {item.detail && <span className="activity-item-detail">{item.detail}</span>}
                </span>
                <span className="activity-item-meta">
                  {item.when && <span className="activity-when">{item.when}</span>}
                  {item.canRunNow && (
                    <button
                      type="button"
                      className="activity-action"
                      title={RUN_NOW_HINT}
                      disabled={pendingKey === item.key}
                      aria-label={`Run ${item.label.toLowerCase()} for ${item.detail} now`}
                      onClick={() => runNow(item)}
                    >
                      {pendingKey === item.key ? 'Requesting…' : 'Run now'}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {finished.length > 0 && (
        <section className="activity-section" aria-labelledby="activity-finished-title">
          <div className="activity-section-heading">
            <h3 id="activity-finished-title" className="activity-section-title">
              Just finished
            </h3>
            <button type="button" className="activity-link" onClick={() => onOpenActionLog()}>
              Action log
            </button>
          </div>
          <ul className="activity-list">
            {finished.map((item) => (
              <li key={item.key} className="activity-item" data-outcome={item.outcome}>
                <span className="activity-item-main">
                  <span className="activity-outcome" aria-hidden="true">
                    {item.outcome === 'failed' ? '✗' : item.outcome === 'ok' ? '✓' : item.outcome === 'skipped' ? '–' : '·'}
                  </span>
                  <span className="activity-item-label" title={describeActivityKind(item.kind) || undefined}>
                    {item.label}
                    {item.outcome === 'failed' && <span className="ui-visually-hidden"> failed</span>}
                  </span>
                  {item.detail && <span className="activity-item-detail">{item.detail}</span>}
                </span>
                <span className="activity-item-meta">
                  <span className="activity-when">{item.ago}</span>
                  {item.kind && (
                    <button
                      type="button"
                      className="activity-action"
                      aria-label={`Show ${item.label} from ${item.ago} in the action log`}
                      onClick={() => onOpenActionLog({ kind: item.kind || '', atMs: item.atMs })}
                    >
                      Log
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="activity-guide">
        <summary>What these are</summary>
        <dl>
          {ACTIVITY_KIND_GUIDE.map((guide) => (
            <div key={guide.kind} className="activity-guide-entry">
              <dt>{guide.label}</dt>
              <dd>{guide.does}</dd>
              <dd className="activity-guide-not">
                <span className="activity-guide-not-label">Doesn't update:</span> {guide.doesNotUpdate}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

/**
 * The app header's Activity button and its popover (UI_REDESIGN_PLAN.md,
 * phase 9c; reorganised 2026-11-05): all background activity in one place,
 * by what you want to know rather than where it comes from
 * (pr-activity-view.helpers.ts):
 * - Problems, at the top and only when there are some: a repo paused by
 *   its circuit breaker (with Reset), live updates lost, backfill status.
 * - Now: everything running - background jobs with their repos, your
 *   requests from this tab, bulk batches, backfill - with elapsed times.
 * - Up next: the dispatcher's queue in its order ("due now", "in 6m",
 *   with Run now), Quick check waiting on a refresh, and what's queued for
 *   the drain.
 * - Just finished: background jobs and your requests, newest first, with
 *   the error when a job failed; the full history is Settings › Action log.
 *
 * The button counts what's running or queued, and turns red with a
 * problem. A header popover (useHeaderPopover), which its close button
 * closes too. Opening focuses the popover itself (not its close button,
 * whose tooltip would take the first Esc). Its content mounts only while
 * open, with its own clock for the times.
 */
export function ActivityPopover() {
  const titleId = useId();
  const panelId = useId();
  const { isOpen, open, close, buttonRef, panelRef, panelStyle } = useHeaderPopover();
  const { jobs, tasks } = useJobEvents();
  const { bulkBatches } = usePrActivityQueue();
  const { activeRequests } = useRequestActivityDisplay();
  const problems = useActivityProblems();
  const settings = useSettingsDrawer();

  // Chunks still waiting or in flight across every tracked bulk batch.
  const queuedChunkCount = bulkBatches.reduce((sum, batch) => sum + (batch.totalChunks - batch.doneCount - batch.failedCount), 0);
  const activityCount = countActivity({ jobs, tasks, activeRequests }) + queuedChunkCount;
  const buttonLabel = [
    'Activity',
    activityCount > 0 ? `${activityCount} running or queued` : '',
    problems.length > 0 ? `${problems.length} problem${problems.length === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <Button
        ref={buttonRef}
        icon="pulse"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        aria-label={buttonLabel === 'Activity' ? undefined : buttonLabel}
        onClick={() => (isOpen ? close(false) : open())}
      >
        Activity
        {(activityCount > 0 || problems.length > 0) && (
          <span className="app-header-count" data-tone={problems.length > 0 ? 'danger' : undefined} aria-hidden="true">
            {problems.length > 0 ? '!' : activityCount}
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
          <NowProvider tickMs={ACTIVITY_TICK_MS}>
            <ActivityContent
              onOpenActionLog={(focus) => {
                close(false);
                if (focus) settings.openActionLogAt(focus);
                else settings.open('action-log');
              }}
            />
          </NowProvider>
        </div>
      )}
    </>
  );
}
