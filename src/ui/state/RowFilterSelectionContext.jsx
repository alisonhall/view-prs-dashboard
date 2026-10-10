import { createContext, useContext } from 'react';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering"): checked-state
 * Context for the 5 row-filtering multi-selects (include/exclude label,
 * author, assigned, approver) - the one cluster of filter inputs that had
 * no Context mirror at all before this (sub-phase 7.4 deliberately left
 * them DOM/local-component-state-only; see RowFilterSelectionProvider.jsx's
 * own comment for why that's revisited now). The other 4 multi-selects
 * (thread-resolution allow/deny, the 2 change-filter actor lists) don't
 * feed row filtering and stay exactly as they were - local state inside
 * MultiSelectCheckboxList, untouched by this Context.
 *
 * `checkedByListId` is a plain object keyed by the 5 list ids
 * (MultiSelectListPortals.jsx's own `MULTI_SELECT_LIST_ID_PREFIXES` keys),
 * each value a `Set<string>` of currently-checked option values.
 */
export const RowFilterSelectionContext = createContext(null);

export function useRowFilterSelection() {
  const context = useContext(RowFilterSelectionContext);
  if (!context) {
    throw new Error('useRowFilterSelection() must be called within a <RowFilterSelectionProvider>');
  }
  return context;
}
