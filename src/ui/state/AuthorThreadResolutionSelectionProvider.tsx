import type { ReactNode } from 'react';
import {
  AuthorThreadResolutionSelectionContext,
  type AuthorThreadResolutionListId,
} from './AuthorThreadResolutionSelectionContext';
import { useCheckedByListIdState } from './useCheckedByListIdState';

/**
 * Owns the 2 thread-resolution allow/deny multi-selects' checked state, so
 * the Conversations tab (useAuthorThreadResolutionPolicy) can read it
 * without a DOM query.
 */
export function AuthorThreadResolutionSelectionProvider({ children }: { children?: ReactNode }) {
  const value = useCheckedByListIdState<AuthorThreadResolutionListId>();

  return (
    <AuthorThreadResolutionSelectionContext.Provider value={value}>
      {children}
    </AuthorThreadResolutionSelectionContext.Provider>
  );
}
