import { useEffect, useState } from 'react';

/**
 * Returns a copy of `value` that only updates `delayMs` after the last
 * time `value` actually changed, clearing any pending update if `value`
 * changes again first - same debounce semantics as
 * `useDebouncedCallback.jsx`'s `useDebouncedEffect`, but for a VALUE used
 * directly in a render (e.g. a `useMemo` dependency) rather than a
 * side-effect callback. Unlike `useDebouncedEffect`, the FIRST render's
 * value is returned immediately (no artificial initial delay) - only
 * subsequent changes are debounced.
 *
 * Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering"): added
 * specifically for `useVisiblePrNumbers.jsx`'s `filterPrNumbers` input -
 * the one free-text field in that hook's filter criteria a user can type
 * into character by character. Without this, every keystroke re-filters
 * the whole table immediately, which visibly flickers through wrong
 * intermediate matches while typing (e.g. typing "12" briefly shows PR #1
 * before showing PR #12). Every other input this hook reads (scope,
 * multi-select checkboxes, the 6 "Any" selects) is a discrete click/
 * selection, not prone to this same rapid-fire-keystroke class of churn,
 * so this is deliberately NOT applied generically to every field.
 */
export function useDebouncedValue(value, delayMs) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
