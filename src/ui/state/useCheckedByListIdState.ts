import { useCallback, useMemo, useState } from 'react';

/**
 * The checked-state shared by the three multi-select selection Contexts
 * (RowFilterSelection, AuthorThreadResolutionSelection,
 * ChangeFilterActorSelection): for each list id, the Set of currently
 * checked option values, plus `toggle` and `setChecked`. Each Context
 * passes its own list ids as `L`.
 *
 * No debounce on the writes, same as FilterStateProvider's setValue.
 */
export interface CheckedByListIdValue<L extends string> {
  checkedByListId: Partial<Record<L, Set<string>>>;
  toggle: (listId: L, value: string) => void;
  setChecked: (listId: L, values: unknown) => void;
}

export function useCheckedByListIdState<L extends string>(): CheckedByListIdValue<L> {
  const [checkedByListId, setCheckedByListId] = useState<Partial<Record<L, Set<string>>>>({});

  // Anything other than an array clears the list. The same values keep
  // the same state, so nothing re-renders (or re-saves): the lists'
  // seeding writes every list each time their options are rebuilt, which
  // is every data poll.
  const setChecked = useCallback((listId: L, values: unknown) => {
    setCheckedByListId((previous) => {
      const next = new Set(Array.isArray(values) ? values : []);
      const current = previous[listId];
      if (current && current.size === next.size && Array.from(next).every((value) => current.has(value))) {
        return previous;
      }
      return { ...previous, [listId]: next };
    });
  }, []);

  const toggle = useCallback((listId: L, value: string) => {
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

  // The same object until the state changes: consumers depend on it (the
  // filters' save watcher, for one).
  return useMemo(() => ({ checkedByListId, toggle, setChecked }), [checkedByListId, toggle, setChecked]);
}
