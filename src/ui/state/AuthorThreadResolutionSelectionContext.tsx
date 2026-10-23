import { createContext, useContext } from 'react';
import type { CheckedByListIdValue } from './useCheckedByListIdState';

/**
 * Checked state for the 2 "PR author thread resolution" multi-selects (the
 * allow/deny thread-starter lists), which ReviewThreadsSection reads to
 * decide whether a PR author resolving someone's thread is allowed. Kept
 * separate from RowFilterSelectionContext because these lists don't feed
 * row filtering.
 */
export type AuthorThreadResolutionListId =
  | 'attention-author-thread-resolution-allow-list'
  | 'attention-author-thread-resolution-deny-list';

export type AuthorThreadResolutionSelectionValue = CheckedByListIdValue<AuthorThreadResolutionListId>;

export const AuthorThreadResolutionSelectionContext = createContext<AuthorThreadResolutionSelectionValue | null>(null);

export function useAuthorThreadResolutionSelection(): AuthorThreadResolutionSelectionValue {
  const context = useContext(AuthorThreadResolutionSelectionContext);
  if (!context) {
    throw new Error(
      'useAuthorThreadResolutionSelection() must be called within a <AuthorThreadResolutionSelectionProvider>',
    );
  }
  return context;
}
