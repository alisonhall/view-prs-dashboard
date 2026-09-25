/**
 * ScopeFilterSelect - React-owned "View scope" dropdown.
 *
 * Phase 6 (see REACT_MIGRATION_PLAN.md): migrated from local `useState` to
 * `<FilterStateProvider>`'s shared Context - this is one of the two Slice 1
 * proof-of-concept fields. Still renders the same `<select id="scope-mode">`
 * vanilla used to render statically, so every existing vanilla read of the
 * *element itself* keeps working; `deriveRunPrDataContext`
 * (pr-run-pr-data-context.helpers.js) now reads its *value* from
 * `window.getFilterStateValues().scopeMode` instead of `.value` off this
 * element, and `persistUiOptionOverrides`/`restoreUiOptionOverrides`
 * (index.page.js) read/write through `window.getFilterStateValues`/
 * `setFilterStateValue` for this field id too - see those call sites'
 * own comments.
 *
 * A dispatched native "change" event (e.g. some other legacy code
 * manipulating this element directly) still reaches this component's
 * `onChange` normally, since React listens for real DOM events - that
 * property isn't specific to local `useState` vs. Context.
 *
 * @module components/ScopeFilterSelect
 */

import { useFilterState } from '../state/FilterStateContext';

export function ScopeFilterSelect() {
  const { values, setValue } = useFilterState();

  return (
    <select
      id="scope-mode"
      name="scopeMode"
      value={values.scopeMode}
      onChange={(e) => setValue('scopeMode', e.target.value)}
    >
      <option value="all">All stored rows</option>
      <option value="last-run">Last run rows</option>
      <option value="needs-attention">Needs attention rows</option>
      <option value="needs-attention-or-interacted">Needs attention or interacted rows</option>
    </select>
  );
}
