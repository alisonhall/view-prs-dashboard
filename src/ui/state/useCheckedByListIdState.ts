import { useCallback, useState } from 'react';

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

  // Anything other than an array clears the list.
  const setChecked = useCallback((listId: L, values: unknown) => {
    setCheckedByListId((previous) => ({
      ...previous,
      [listId]: new Set(Array.isArray(values) ? values : []),
    }));
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

  // A new object each render, as the three Providers always returned.
  return { checkedByListId, toggle, setChecked };
}
