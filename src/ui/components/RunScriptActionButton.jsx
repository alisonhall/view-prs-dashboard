/**
 * RunScriptActionButton - generic, fully stateless React-owned button.
 *
 * Phase D (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): one
 * component for all 6 trigger buttons this phase converts (Run script,
 * Apply ack only, Apply clear only, Apply label, Refresh labels, Apply
 * filters (local)) - matching `DataTabButton.jsx`'s "no field-specific
 * behavior" shape. None of these 6 have ever had disabled/pending visual
 * state in the vanilla version (confirmed via grep - no `.disabled =`
 * writes for any of their ids anywhere), so this is deliberately NOT the
 * `TriggerAutoRunButton.jsx` local-state-machine shape - adding one here
 * would be new behavior, not a like-for-like conversion. The business
 * logic itself stays in `index.page.js`, reached only via the injected
 * `onClick` callback (a `window.*` bridge).
 *
 * @module components/RunScriptActionButton
 */

export function RunScriptActionButton({ id, label, title, className, onClick }) {
  return (
    <button type="button" id={id} className={className} title={title} onClick={() => onClick?.()}>
      {label}
    </button>
  );
}
