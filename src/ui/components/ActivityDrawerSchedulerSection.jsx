import { useJobEvents } from '../state/JobEventsContext';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';

const { formatIsoDatetime } = createPrFormattingHelpers();

const JOB_LABELS = {
  autoRefresh: 'Auto refresh',
  quickCheck: 'Quick check',
  mergedQueueDrain: 'Merged/closed drain',
};

const CONNECTION_MESSAGES = {
  connecting: 'Connecting to live updates…',
  reconnecting: 'Live updates reconnecting…',
  offline: 'Live updates disconnected — retrying…',
  unsupported: 'Live updates unavailable in this browser.',
};

function JobRow({ jobKey, job, pendingOpenCount, pendingMergedClosedCount }) {
  const label = JOB_LABELS[jobKey] || jobKey;
  const isRunning = job.status === 'running';
  const hasPendingWork = pendingOpenCount > 0 || pendingMergedClosedCount > 0;

  return (
    <div className="activity-drawer-job-row">
      <div className="activity-drawer-job-row-header">
        <span className="activity-drawer-job-label">{label}</span>
        <span
          className={`activity-drawer-job-status ${isRunning ? 'is-running' : 'is-idle'}`}
        >
          {isRunning ? 'Running' : 'Idle'}
        </span>
      </div>

      {jobKey === 'quickCheck' && job.waitingOn && (
        <div className="activity-drawer-job-waiting">
          Waiting on auto refresh — will run as soon as the refresh finishes.
        </div>
      )}

      {jobKey === 'mergedQueueDrain' && hasPendingWork && (
        <div className="activity-drawer-job-waiting">
          Update queued: {pendingOpenCount} open, {pendingMergedClosedCount} merged/closed - flagged by
          quick check, waiting for the next drain.
        </div>
      )}

      <div className="activity-drawer-job-detail">
        Last finished: {formatIsoDatetime(job.lastFinishedAt)}
        {job.lastOk === false && job.lastError ? ` — error: ${job.lastError}` : ''}
      </div>

      {job.lastSkip && (
        <div className="activity-drawer-job-skip">
          Last skip: {job.lastSkip.reason || 'unknown'} ({formatIsoDatetime(job.lastSkip.at)})
        </div>
      )}
    </div>
  );
}

/**
 * Activity drawer feature (see REACT_MIGRATION_PLAN.md): section 1 of the
 * drawer, the three genuinely in-process background jobs, driven live by
 * JobEventsContext (SSE). Deliberately does not render a queue position
 * for quickCheck's "waitingOn" state - the server has no real ordered
 * queue, just one deferred-retry flag (see runViewPrsQuickCheck's own
 * comment in app.js), so the honest copy here is "waiting on X", never a
 * position or count.
 *
 * pendingOpenCount/pendingMergedClosedCount (shown on the mergedQueueDrain
 * row) carry the one piece of information the old, now-removed
 * #scheduler-badges display had that nothing else in the drawer covered -
 * PRs quick-check already flagged as changed but not yet picked up by a
 * full drain.
 */
export function ActivityDrawerSchedulerSection() {
  const { connection, isStale, jobs, pendingOpenCount, pendingMergedClosedCount } = useJobEvents();
  const connectionMessage = connection !== 'open' ? CONNECTION_MESSAGES[connection] : null;

  return (
    <section className="activity-drawer-section">
      <h3 className="activity-drawer-section-title">Scheduled background jobs</h3>
      <p className="activity-drawer-section-caption">
        Live — pushed by the server. One job of each kind runs at a time; these are status
        flags, not a queue.
      </p>

      {connectionMessage && (
        <div className="activity-drawer-connection-banner">{connectionMessage}</div>
      )}
      {connection === 'open' && isStale && (
        <div className="activity-drawer-connection-banner">
          Live updates may be stale — no update received recently.
        </div>
      )}

      <JobRow jobKey="autoRefresh" job={jobs.autoRefresh} />
      <JobRow jobKey="quickCheck" job={jobs.quickCheck} />
      <JobRow
        jobKey="mergedQueueDrain"
        job={jobs.mergedQueueDrain}
        pendingOpenCount={pendingOpenCount}
        pendingMergedClosedCount={pendingMergedClosedCount}
      />
    </section>
  );
}
