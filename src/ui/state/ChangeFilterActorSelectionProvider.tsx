import type { ReactNode } from 'react';
import {
  ChangeFilterActorSelectionContext,
  type ChangeFilterActorListId,
} from './ChangeFilterActorSelectionContext';
import { useCheckedByListIdState } from './useCheckedByListIdState';

/**
 * Owns the 2 change-filter actor multi-selects' checked state, so
 * FilterStateProvider's buildOverrides() can read it directly.
 */
export function ChangeFilterActorSelectionProvider({ children }: { children?: ReactNode }) {
  const value = useCheckedByListIdState<ChangeFilterActorListId>();

  return (
    <ChangeFilterActorSelectionContext.Provider value={value}>
      {children}
    </ChangeFilterActorSelectionContext.Provider>
  );
}
