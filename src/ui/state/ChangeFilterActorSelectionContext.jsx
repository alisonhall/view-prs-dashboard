import { createContext, useContext } from 'react';

/**
 * Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * checked-state Context for the 2 "change filter" actor multi-selects
 * (ignore-comments-from-authors/ignore-reviews-from-authors) - the last 2
 * of the 9 multi-select lists with no Context mirror at all (the other 7
 * already have one: RowFilterSelectionContext for the 5 row-filtering
 * lists, AuthorThreadResolutionSelectionContext for the 2 thread-
 * resolution lists). A dedicated Context rather than widening one of those
 * 2, since these lists feed neither row filtering nor thread resolution -
 * reusing either name for a third, different concern would be misleading.
 *
 * `checkedByListId` is a plain object keyed by the 2 list ids
 * (MultiSelectListPortals.jsx's own `MULTI_SELECT_LIST_ID_PREFIXES` keys:
 * `change-filter-ignore-comment-authors-list`/`change-filter-ignore-review-authors-list`),
 * each value a `Set<string>` of currently-checked option values.
 */
export const ChangeFilterActorSelectionContext = createContext(null);

export function useChangeFilterActorSelection() {
  const context = useContext(ChangeFilterActorSelectionContext);
  if (!context) {
    throw new Error('useChangeFilterActorSelection() must be called within a <ChangeFilterActorSelectionProvider>');
  }
  return context;
}
