import { useJobEvents } from '../state/JobEventsContext';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';

const { formatIsoDatetime } = createPrFormattingHelpers();

const JOB_LABELS = {
  autoRefresh: 'Auto refresh',
  quickCheck: 'Quick check',
  mergedQueueDrain: 'Merged/closed drain',
};

const DISPLAY_LIMIT = 5;

/**
 * Activity drawer feature (see REACT_MIGRATION_PLAN.md): a short history of
 * what *just* happened, closing the gap "not all actions are shown" left
 * even after the live sections above cover in-progress work - a request
 * that finished a few seconds ago has already disappeared from "In-flight
 * user actions" by the time most users notice it.
 *
 * Two separate lists, not one merged timeline, because they're honestly
 * different kinds of information:
 * - Scheduled jobs (left) comes from JobEventsContext's own recentFinished
 *   (SSE-driven), which already carries a real ok/error outcome for free.
 * - "Actions from this tab" (right) is a lighter-weight, this-tab-only
 *   history - "finished" just means the in-flight counter returned to 0,
 *   not success or failure (threading real outcomes through every one of
 *   ack/apply-label/notes/etc.'s own try/catch shapes would be a much
 *   larger change for a history list than this feature asked for; each of
 *   those actions already has its own failure notification/snackbar at the
 *   time it happens).
 */
export function ActivityDrawerRecentActivitySection({ recentRequestActivity = [] }) {
  const { recentFinished: recentFinishedRaw } = useJobEvents();
  const recentFinished = Array.isArray(recentFinishedRaw) ? recentFinishedRaw : [];

  if (recentFinished.length === 0 && recentRequestActivity.length === 0) {
    return null;
  }

  return (
    <section className="activity-drawer-section">
      <h3 className="activity-drawer-section-title">Recent activity</h3>
      <p className="activity-drawer-section-caption">
        What just finished - see the Action Log tab for full history.
      </p>

      {recentFinished.length > 0 && (
        <div className="activity-drawer-recent-group">
          <div className="activity-drawer-recent-group-label">Scheduled jobs</div>
          <ul className="activity-drawer-recent-list">
            {recentFinished.slice(0, DISPLAY_LIMIT).map((entry, index) => (
              <li
                key={`${entry.job}-${entry.at}-${index}`}
                className={`activity-drawer-recent-item ${entry.ok === false ? 'is-failed' : ''}`}
              >
                {JOB_LABELS[entry.job] || entry.job} — {entry.ok === false ? 'failed' : 'ok'} (
                {formatIsoDatetime(entry.at)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {recentRequestActivity.length > 0 && (
        <div className="activity-drawer-recent-group">
          <div className="activity-drawer-recent-group-label">Actions from this tab</div>
          <ul className="activity-drawer-recent-list">
            {recentRequestActivity.slice(0, DISPLAY_LIMIT).map((entry, index) => (
              <li key={`${entry.key}-${entry.finishedAt}-${index}`} className="activity-drawer-recent-item">
                {entry.label} ({formatIsoDatetime(entry.finishedAt)})
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
