import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { FilterStateContext } from './FilterStateContext';
import { useDebouncedEffect } from './useDebouncedCallback';

const DEBOUNCE_MS = 150;

/**
 * Phase 6 (see REACT_MIGRATION_PLAN.md): owns the Context state for every
 * filter field migrated off the vanilla DOM-is-the-source-of-truth
 * pattern, and replaces `filterChangeDebounceTimer`/`debouncedApplyFilters`
 * (index.page.js) for exactly those fields - the debounced effect below
 * calls `window.debouncedApplyFilters()` (still the same vanilla function;
 * only *what triggers it* for these fields has moved) whenever `values`
 * changes, skipping the initial mount.
 *
 * Exposes `window.getFilterStateValues()`/`window.setFilterStateValue(key, value)`
 * so vanilla code (the render pipeline's DOM-read call sites,
 * `persistUiOptionOverrides`/`restoreUiOptionOverrides`) can read/write
 * Context state without needing its own React tree - same
 * handled/fallback bridge shape every Phase 2/3 conversion already uses,
 * just in the read direction as well as the update direction.
 */
export function FilterStateProvider({ initialValues, children }) {
  const [values, setValues] = useState(initialValues);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const setValue = useCallback((key, value) => {
    setValues((previous) => ({ ...previous, [key]: value }));
  }, []);

  useEffect(() => {
    window.getFilterStateValues = () => valuesRef.current;
    // Phase 6, Slice 7 (see REACT_MIGRATION_PLAN.md): flushSync-wrapped so
    // a write is synchronously visible to any window.getFilterStateValues()
    // read that follows in the same call stack - needed for
    // restoreUiOptionOverrides' multi-select "pending selections" write ->
    // immediate same-tick re-populate-read chain (index.page.js), the same
    // stale-batched-read problem react-app.jsx's renderReactMultiSelectList
    // bridge already solves with flushSync for the same reason.
    window.setFilterStateValue = (key, value) => {
      flushSync(() => setValue(key, value));
    };
    return () => {
      delete window.getFilterStateValues;
      delete window.setFilterStateValue;
    };
  }, [setValue]);

  // Every key here matches a field in index.page.js's `debouncedApplyOnChangeIds`
  // Set (i.e. one that already auto-applies on change under the vanilla
  // mechanism) - as more fields migrate onto this Context, add their key
  // here too so changing them still triggers a debounced apply.
  // changeFilterUseBuiltinMergePattern/changeFilterIgnoreCommitPatterns
  // are special cases with their own auto-*persist*-on-change behavior
  // too (not just apply) - that stays owned entirely by the delegated
  // `#run-script-form` listener (index.page.js), unaffected by Context
  // migration since it reacts to the same real native "change" event
  // either way; they're listed here only for the same "harmless
  // double-hookup" consistency every other auto-apply field gets.
  useDebouncedEffect(
    () => {
      window.debouncedApplyFilters?.();
    },
    [
      values.scopeMode,
      values.alwaysShowInReview,
      values.attentionNoActivityMode,
      values.attentionIncludePendingComments,
      values.attentionIgnoreMergeOnlyCommits,
      values.attentionIncludeClosedMerged,
      values.attentionIncludeDraftChanged,
      values.attentionIncludeDraftNoActivity,
      values.filterPrNumbers,
      values.attentionAuthorThreadResolutionMode,
      values.changeFilterUseBuiltinMergePattern,
      values.changeFilterIgnoreCommitPatterns,
    ],
    DEBOUNCE_MS,
  );

  return (
    <FilterStateContext.Provider value={{ values, setValue }}>
      {children}
    </FilterStateContext.Provider>
  );
}
