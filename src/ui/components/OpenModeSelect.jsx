/**
 * OpenModeSelect - React-owned "Open mode" dropdown (Run Script options).
 *
 * Phase 6 (see REACT_MIGRATION_PLAN.md): migrated from local `useState` to
 * `<FilterStateProvider>`'s shared Context, same treatment as
 * ScopeFilterSelect/AttentionNoActivityModeSelect. Unlike those two, this
 * field isn't read anywhere via a direct `getElementById(...).value` in
 * the render pipeline except `getOpenModeFilter` (index.page.js) - the
 * "Run script" action itself reads it via `new FormData(form)` off this
 * element's real `name` attribute, which reflects whatever React renders
 * here regardless of migration status, so that call site needs no change.
 *
 * @module components/OpenModeSelect
 */

import { useFilterState } from '../state/FilterStateContext';

export function OpenModeSelect() {
  const { values, setValue } = useFilterState();

  return (
    <select
      id="open-mode"
      name="openMode"
      value={values.openMode}
      onChange={(e) => setValue('openMode', e.target.value)}
    >
      <option value="none">none</option>
      <option value="changed">changed</option>
      <option value="all">all</option>
    </select>
  );
}
