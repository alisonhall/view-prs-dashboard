/**
 * BackfillLogControls - the Backfill tab's log-details auto-scroll
 * checkbox + "Refresh log" button.
 *
 * Phase C (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * replaces `index.page.js`'s vanilla click/change-wiring for these 2
 * controls. The checkbox is deliberately uncontrolled (`defaultChecked`,
 * not `checked`) - `pr-ui-option-scroll.helpers.js`'s
 * `shouldAutoScrollBackfillLog` reads `#backfill-log-autoscroll`'s live
 * `.checked` DOM value at call time, not from any pushed React state, so
 * an uncontrolled checkbox with the same id satisfies that unchanged.
 * `onAutoscrollChange` still calls the same `autoScrollBackfillLogToBottom`
 * (which also directly mutates `#backfill-log`'s `.scrollTop` - stays
 * imperative, React doesn't own scroll position).
 *
 * @module components/BackfillLogControls
 */

export function BackfillLogControls({ refreshLogDisabled, onRefreshLog, onAutoscrollChange }) {
  return (
    <div className="backfill-log-options">
      <label>
        <input type="checkbox" id="backfill-log-autoscroll" defaultChecked onChange={() => onAutoscrollChange?.()} />
        Auto-scroll log while running
      </label>
      <button
        type="button"
        id="backfill-log-refresh-btn"
        disabled={Boolean(refreshLogDisabled)}
        onClick={() => onRefreshLog?.()}
      >
        Refresh log
      </button>
    </div>
  );
}
