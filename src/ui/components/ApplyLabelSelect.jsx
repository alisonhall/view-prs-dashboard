
/**
 * Renders the Run & Filter tab's "Apply existing GitHub label" dropdown
 * (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md - one of the two
 * candidates the `document.createElement` survey surfaced). Mounted into
 * `#apply-label-select-root`, portaling the real `<select id="apply-label-select">`
 * into place - same shape as Phase 2's single-field selects
 * (e.g. ScopeFilterSelect.jsx).
 *
 * Deliberately uncontrolled (no `value`/`onChange`): `handleApplyLabelClick`
 * (index.page.js) reads `select.value` directly at click-time, the same "a
 * real DOM node's value is correct regardless of what renders it" property
 * every other Phase 2/6 field already relies on - no bridge needed for
 * reading the selection. Re-rendering with a fresh `labels` array (e.g.
 * after "Reload labels for the current repo") is safe without a `key`
 * remount too: a native `<select>` keeps its current selection if that
 * option is still present among the new children, and otherwise falls back
 * to the first option automatically - exactly the "restore previous value
 * if still valid, else reset to placeholder" behavior the vanilla
 * `populateApplyLabelSelect` used to implement by hand.
 */
export function ApplyLabelSelect({ labels = [] }) {
  return (
    <select id="apply-label-select">
      <option value="">{labels.length ? 'Choose a label...' : 'No labels found for this repo'}</option>
      {labels.map((label) => (
        <option key={label.name} value={label.name}>
          {label.name}
        </option>
      ))}
    </select>
  );
}
