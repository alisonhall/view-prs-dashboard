import { createContext, useContext } from 'react';
import type { CheckedByListIdValue } from './useCheckedByListIdState';

/**
 * Checked state for the 2 "change filter" actor multi-selects (ignore
 * comments / ignore reviews from these authors), which FilterStateProvider
 * saves with the user defaults. Kept separate from the row-filter and
 * thread-resolution Contexts because these lists feed neither.
 */
export type ChangeFilterActorListId =
  | 'change-filter-ignore-comment-authors-list'
  | 'change-filter-ignore-review-authors-list';

export type ChangeFilterActorSelectionValue = CheckedByListIdValue<ChangeFilterActorListId>;

export const ChangeFilterActorSelectionContext = createContext<ChangeFilterActorSelectionValue | null>(null);

export function useChangeFilterActorSelection(): ChangeFilterActorSelectionValue {
  const context = useContext(ChangeFilterActorSelectionContext);
  if (!context) {
    throw new Error('useChangeFilterActorSelection() must be called within a <ChangeFilterActorSelectionProvider>');
  }
  return context;
}
