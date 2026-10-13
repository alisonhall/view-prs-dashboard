import { useCallback, useState } from 'react';
import { ChangeFilterActorSelectionContext } from './ChangeFilterActorSelectionContext';

/**
 * Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): owns
 * the 2 change-filter actor multi-selects' checked-state as real Context,
 * the same shape RowFilterSelectionProvider.jsx/AuthorThreadResolutionSelectionProvider.jsx
 * already use - so FilterStateProvider.jsx's own buildOverrides() can read
 * "currently checked" directly instead of a DOM-scan window.* bridge.
 */
export function ChangeFilterActorSelectionProvider({ children }) {
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
    <ChangeFilterActorSelectionContext.Provider value={{ checkedByListId, toggle, setChecked }}>
      {children}
    </ChangeFilterActorSelectionContext.Provider>
  );
}
