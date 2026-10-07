import { useJobEvents } from '../state/JobEventsContext';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';

const { formatIsoDatetime } = createPrFormattingHelpers();

const TASK_TYPE_LABELS = {
  autoRefresh: 'Auto refresh',
  quickCheck: 'Quick check',
  mergedDrain: 'Merged/closed drain',
};

/**
 * Activity drawer feature (see REACT_MIGRATION_PLAN.md's dispatcher plan):
 * the per-repo-aware priority dispatcher's own real, ordered task queue -
 * a genuine sibling to ActivityDrawerQueueSection's bulk-chunk queue, not a
 * rewrite of ActivityDrawerSchedulerSection (that section intentionally
 * still shows only status flags per job *type*, since before this
 * dispatcher existed there was no real ordering to show - see its own
 * comment). This section shows the dispatcher's actual next-to-run order,
 * per (repo, task type): running first, then due (highest priority first),
 * then scheduled (soonest due first) - exactly the order
 * getDispatcherQueueSnapshot (view-prs-dispatcher-helpers.js) itself
 * produces, so this component trusts the given order and never re-sorts.
 *
 * Also doubles as the read-only display of each repo's effective
 * priority/cadence (set via the schedulerRepoConfig key in
 * /view-prs/user-defaults - no settings UI yet) - entry.priority/intervalMs
 * are already part of every entry, so no extra plumbing is needed.
 */
export function ActivityDrawerDispatcherSection() {
  const { dispatcherQueue } = useJobEvents();
  const entries = Array.isArray(dispatcherQueue) ? dispatcherQueue : [];

  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="activity-drawer-section">
      <h3 className="activity-drawer-section-title">Dispatcher queue</h3>
      <p className="activity-drawer-section-caption">
        Real queue: shown in the order the dispatcher will actually process it.
      </p>
      <ol className="activity-drawer-dispatcher-queue">
        {entries.map((entry) => (
          <li
            key={`${entry.repo}::${entry.taskType}`}
            className={`activity-drawer-dispatcher-entry is-${entry.status}`}
          >
            <span className="activity-drawer-dispatcher-entry-repo">{entry.repo}</span>
            <span className="activity-drawer-dispatcher-entry-task">
              {TASK_TYPE_LABELS[entry.taskType] || entry.taskType}
            </span>
            <span className="activity-drawer-dispatcher-entry-priority">p{entry.priority}</span>
            <span className="activity-drawer-dispatcher-entry-status">{entry.status}</span>
            {entry.status === 'scheduled' && (
              <span className="activity-drawer-dispatcher-entry-due">
                due {formatIsoDatetime(entry.nextDueAt)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
