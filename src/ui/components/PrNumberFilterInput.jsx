/**
 * PrNumberFilterInput - React-owned "Filter by PR number(s)" input.
 *
 * Phase 6 (see REACT_MIGRATION_PLAN.md): migrated from local `useState` to
 * `<FilterStateProvider>`'s shared Context, same treatment as
 * ScopeFilterSelect/AttentionNoActivityModeSelect. `filter-pr-numbers` is
 * in `debouncedApplyOnChangeIds`, so changing it still triggers a
 * debounced apply (now via `FilterStateProvider`'s own debounced-apply
 * effect instead of the vanilla delegated listener, for this field).
 * `renderPrData` (pr-data-tab.orchestrator.js) prefers this field's
 * Context value over `.value` off this element when the provider has
 * mounted.
 *
 * Window-bridge elimination Phase 7.5: renders the non-credential-field hints
 * (NON_CREDENTIAL_INPUT_PROPS) itself; index.page.js used to add them by DOM
 * id after React rendered this input.
 *
 * @module components/PrNumberFilterInput
 */

import { useFilterState } from '../state/FilterStateContext';
import { NON_CREDENTIAL_INPUT_PROPS } from '../helpers/form-parsing.helpers.ts';

export function PrNumberFilterInput() {
  const { values, setValue } = useFilterState();

  return (
    <input
      type="text"
      id="filter-pr-numbers"
      name="filterPrNumbers"
      placeholder="912, 921"
      {...NON_CREDENTIAL_INPUT_PROPS}
      value={values.filterPrNumbers ?? ''}
      onChange={(e) => setValue('filterPrNumbers', e.target.value)}
    />
  );
}
