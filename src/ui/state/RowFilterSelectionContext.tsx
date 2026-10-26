import { createContext, useContext } from 'react';
import type { CheckedByListIdValue } from './useCheckedByListIdState';

/**
 * Checked state for the 5 row-filtering multi-selects (include/exclude
 * label, author, assigned, approver), which useVisiblePrNumbers reads to
 * filter the table live. The other 4 multi-selects don't feed row
 * filtering and have their own Contexts (AuthorThreadResolutionSelection
 * for the thread-resolution allow/deny lists, ChangeFilterActorSelection
 * for the 2 change-filter actor lists).
 *
 * List ids are the filter bar's list ids (filter-bar-fields.ts's
 * ROW_FILTER_LISTS).
 */
export type RowFilterListId = 'label-list' | 'exclude-label-list' | 'author-list' | 'assigned-list' | 'approver-list';

export type RowFilterSelectionValue = CheckedByListIdValue<RowFilterListId>;

export const RowFilterSelectionContext = createContext<RowFilterSelectionValue | null>(null);

export function useRowFilterSelection(): RowFilterSelectionValue {
  const context = useContext(RowFilterSelectionContext);
  if (!context) {
    throw new Error('useRowFilterSelection() must be called within a <RowFilterSelectionProvider>');
  }
  return context;
}
