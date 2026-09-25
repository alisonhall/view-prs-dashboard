import { createContext, useContext } from 'react';

/**
 * Phase 6 (see REACT_MIGRATION_PLAN.md): shared filter-field state for the
 * fields migrated off the vanilla DOM-is-the-source-of-truth pattern.
 * Slice 1 covers just `scopeMode`/`alwaysShowInReview` - later slices add
 * more keys to `values`, they don't restructure this context's shape.
 *
 * `setValue` intentionally requires the caller to know its own field's key
 * (no magic) - each migrated field component owns exactly one key.
 */
export const FilterStateContext = createContext(null);

export function useFilterState() {
  const context = useContext(FilterStateContext);
  if (!context) {
    throw new Error('useFilterState() must be called within a <FilterStateProvider>');
  }
  return context;
}
