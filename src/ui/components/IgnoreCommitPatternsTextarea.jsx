/**
 * IgnoreCommitPatternsTextarea - React-owned "Ignore commits matching
 * patterns (regex, one per line)" textarea for the Change Detection
 * Filters section.
 *
 * Phase 6 (see REACT_MIGRATION_PLAN.md): migrated from local `useState` to
 * `<FilterStateProvider>`'s shared Context. Its "change" -> persist +
 * apply behavior stays owned entirely by the delegated listener on
 * `<form id="run-script-form">` (gotcha #3) - that listener reacts to the
 * real native "change" event this element always fires regardless of
 * which side manages its value, so no change was needed there; it in turn
 * calls `parseCommitPatterns(textarea)` (form-parsing.helpers.js), which
 * just reads `textarea.value` directly off the real DOM node - also
 * already correct either way. `restoreUiOptionOverrides`'s `setText` now
 * writes through `window.setFilterStateValue` for this field id (see
 * `FILTER_STATE_FIELD_MAP`, index.page.js) instead of the native-setter-
 * plus-dispatched-event trick it used before Context ownership.
 *
 * @module components/IgnoreCommitPatternsTextarea
 */

import { useFilterState } from '../state/FilterStateContext';

export function IgnoreCommitPatternsTextarea() {
  const { values, setValue } = useFilterState();

  return (
    <textarea
      id="change-filter-ignore-commit-patterns"
      name="changeFilterIgnoreCommitPatterns"
      rows="4"
      placeholder={'^docs: \n^test: \n^chore: update dependencies\n^style: formatting'}
      aria-describedby="commit-patterns-help"
      value={values.changeFilterIgnoreCommitPatterns ?? ''}
      onChange={(e) => setValue('changeFilterIgnoreCommitPatterns', e.target.value)}
    />
  );
}
