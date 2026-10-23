import type { ReactNode } from 'react';
import { RowFilterSelectionContext, type RowFilterListId } from './RowFilterSelectionContext';
import { useCheckedByListIdState } from './useCheckedByListIdState';

/**
 * Owns the 5 row-filtering multi-selects' checked state, so
 * useVisiblePrNumbers can filter the table live without reading the DOM.
 */
export function RowFilterSelectionProvider({ children }: { children?: ReactNode }) {
  const value = useCheckedByListIdState<RowFilterListId>();

  return <RowFilterSelectionContext.Provider value={value}>{children}</RowFilterSelectionContext.Provider>;
}
