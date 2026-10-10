import { useCallback, useState } from 'react';
import { RowFilterSelectionContext } from './RowFilterSelectionContext';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering"): owns the 5
 * row-filtering multi-selects' checked-state as real Context, so the new
 * reactive visible-PR-numbers derivation (useVisiblePrNumbers.jsx) can
 * read "currently checked" without a DOM query. Previously this state
 * lived only inside each MultiSelectCheckboxList instance's own local
 * useState, re-seeded via a parent-forced remount - sub-phase 7.4's own
 * deliberate choice not to Context-ify it, since nothing needed to read it
 * reactively at the time. That's no longer true once filtering needs to be
 * live, so this is the one piece of that prior decision being revisited.
 *
 * No debounce on the writes here, same as FilterStateProvider.setValue -
 * the debounce that used to gate vanilla's "Apply filters" re-render is a
 * separate concern (gone entirely for the table once useVisiblePrNumbers
 * is wired in; see that hook's own comment).
 */
export function RowFilterSelectionProvider({ children }) {
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
    <RowFilterSelectionContext.Provider value={{ checkedByListId, toggle, setChecked }}>
      {children}
    </RowFilterSelectionContext.Provider>
  );
}
