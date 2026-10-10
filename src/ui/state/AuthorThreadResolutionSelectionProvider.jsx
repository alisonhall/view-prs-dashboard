import { useCallback, useState } from 'react';
import { AuthorThreadResolutionSelectionContext } from './AuthorThreadResolutionSelectionContext';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md): owns the 2 "PR author thread
 * resolution" allow/deny multi-selects' checked-state as real Context, so
 * ReviewThreadsSection.jsx can read "currently checked" without a DOM
 * query (window.getAuthorThreadResolutionPolicy's own real dependency,
 * see AuthorThreadResolutionSelectionContext.jsx's comment). Same shape
 * and "no debounce on the writes" reasoning as RowFilterSelectionProvider.
 */
export function AuthorThreadResolutionSelectionProvider({ children }) {
  const [checkedByListId, setCheckedByListId] = useState({});

  const setChecked = useCallback((listId, values) => {
    setCheckedByListId((previous) => ({
      ...previous,
      [listId]: new Set(Array.isArray(values) ? values : []),
    }));
  }, []);

  const toggle = useCallback((listId, value) => {
    setCheckedByListId((previous) => {
      const next = new Set(previous[listId] || []);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return { ...previous, [listId]: next };
    });
  }, []);

  return (
    <AuthorThreadResolutionSelectionContext.Provider value={{ checkedByListId, toggle, setChecked }}>
      {children}
    </AuthorThreadResolutionSelectionContext.Provider>
  );
}
