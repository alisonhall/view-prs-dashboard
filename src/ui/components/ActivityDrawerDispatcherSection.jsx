import { useEffect, useRef, useState } from 'react';
import { useJobEvents } from '../state/JobEventsContext';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';

const { formatIsoDatetime } = createPrFormattingHelpers();

const TASK_TYPE_LABELS = {
  autoRefresh: 'Auto refresh',
  quickCheck: 'Quick check',
  mergedDrain: 'Merged/closed drain',
};

// Shown as each status word's tooltip (native title attribute - this
// codebase's only tooltip mechanism, see QuickCheckButton.jsx) - spells out
// what the one-word status actually means, since "due" in particular reads
// ambiguously (it means "waiting its turn", not "overdue/late").
const STATUS_EXPLANATIONS = {
  running: 'Currently executing.',
  due: 'Past its scheduled time and waiting for a free slot in the shared gh-process budget - runs on the next dispatcher tick that has room.',
  scheduled: "Waiting for its next scheduled time - hasn't come due yet.",
};

const PRIORITY_TOOLTIP =
  'Priority ranks which task wins when several are due at the same moment - it does not change WHEN a task becomes due, only which due task goes first. ' +
  'Default priorities: quick check p5 (highest), auto refresh p3, merged/closed drain p1 (lowest). Can be overridden per repo.';

const BUMP_TOOLTIP =
  'Runs this sooner: makes it due immediately instead of waiting for its scheduled time. ' +
  "Does not change its priority, so a higher-priority task that's also due will still go first.";

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
 *
 * `onBump(repo, taskType)` (optional - the manual reprioritize action,
 * wired from index.page.js's handleDispatcherBump via ActivityDrawer.jsx)
 * lets a person pull one scheduled entry forward instead of waiting for its
 * due time. Only offered for `scheduled` entries - a `due`/`running` entry
 * is already about to run (or running), so bumping it would have no effect.
 */
export function ActivityDrawerDispatcherSection({ onBump }) {
  const { dispatcherQueue } = useJobEvents();
  const entries = Array.isArray(dispatcherQueue) ? dispatcherQueue : [];
  const [bumpingKey, setBumpingKey] = useState(null);
  // Guards the setBumpingKey call below against firing after unmount - this
  // section lives inside the drawer's collapsible panel (see
  // ActivityDrawer.jsx's `{isOpen && (...)}` block), which unmounts on
  // close, so a bump request still in flight when the drawer is closed
  // would otherwise resolve into a "state update on an unmounted
  // component" warning. Same `cancelled`-style guard already used for
  // async effects elsewhere in this codebase (ExportTab.jsx, PrJsonModal.jsx).
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  if (entries.length === 0) {
    return null;
  }

  const handleBumpClick = async (entry) => {
    const key = `${entry.repo}::${entry.taskType}`;
    setBumpingKey(key);
    try {
      await onBump?.(entry.repo, entry.taskType);
    } finally {
      if (isMountedRef.current) {
        setBumpingKey((previous) => (previous === key ? null : previous));
      }
    }
  };

  return (
    <section className="activity-drawer-section">
      <h3 className="activity-drawer-section-title">Dispatcher queue</h3>
      <p className="activity-drawer-section-caption">
        Real queue: shown in the order the dispatcher will actually process it.
      </p>
      <p className="activity-drawer-dispatcher-legend" title={PRIORITY_TOOLTIP}>
        Priority: higher number runs first when multiple tasks are due at the same time.
      </p>
      <ol className="activity-drawer-dispatcher-queue">
        {entries.map((entry) => {
          const key = `${entry.repo}::${entry.taskType}`;
          const isBumping = bumpingKey === key;
          return (
            <li key={key} className={`activity-drawer-dispatcher-entry is-${entry.status}`}>
              <span className="activity-drawer-dispatcher-entry-repo">{entry.repo}</span>
              <span className="activity-drawer-dispatcher-entry-task">
                {TASK_TYPE_LABELS[entry.taskType] || entry.taskType}
              </span>
              <span className="activity-drawer-dispatcher-entry-priority" title={PRIORITY_TOOLTIP}>
                priority {entry.priority}
              </span>
              <span
                className="activity-drawer-dispatcher-entry-status"
                title={STATUS_EXPLANATIONS[entry.status]}
              >
                {entry.status}
              </span>
              {entry.status === 'scheduled' && (
                <span className="activity-drawer-dispatcher-entry-due">
                  due {formatIsoDatetime(entry.nextDueAt)}
                </span>
              )}
              {entry.status === 'scheduled' && typeof onBump === 'function' && (
                <button
                  type="button"
                  className="activity-drawer-dispatcher-entry-bump"
                  disabled={isBumping}
                  onClick={() => handleBumpClick(entry)}
                  title={BUMP_TOOLTIP}
                >
                  {isBumping ? 'Requesting…' : 'Run now'}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
