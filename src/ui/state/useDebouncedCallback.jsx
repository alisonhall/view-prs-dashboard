import { useEffect, useRef } from 'react';

/**
 * Calls `callback` `delayMs` after the last time `deps` changed, clearing
 * any pending call if `deps` changes again first - the same semantics as
 * the vanilla `filterChangeDebounceTimer`/`debouncedApplyFilters` closure
 * it replaces (see REACT_MIGRATION_PLAN.md, Phase 6). Never fires on the
 * very first render (mount), matching the vanilla version's behavior:
 * nothing calls `applyFiltersFromCache()` just because a field mounted,
 * only in response to a later value change.
 */
export function useDebouncedEffect(callback, deps, delayMs) {
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
