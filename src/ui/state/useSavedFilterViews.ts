import { useCallback, useMemo, useState } from 'react';
import { useFilterState } from './FilterStateContext';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import { useSavedItemsStore } from './useSavedItemsStore';
import {
  SAVED_FILTER_VIEWS_KEY,
  VIEW_FIELD_KEYS,
  VIEW_LIST_IDS,
  hasAnyFilter,
  isSameFilters,
  readSavedFilterViews,
  toSavedFilterViewsValue,
  toViewFilters,
  type SavedFilterView,
  type ViewFilters,
} from '../helpers/saved-filter-views.helpers.ts';
import { getActiveAndModifiedIds, makeItemId } from '../helpers/saved-items.helpers.ts';

const NO_FILTERS = toViewFilters({}, {});

export interface SavedFilterViewsValue {
  // Null until read from the user defaults, and while they can't be (a
  // view saved then would be lost).
  views: SavedFilterView[] | null;
  // The filters applied now, as a view keeps them.
  current: ViewFilters;
  // The view whose filters are the current ones; "" when none is.
  activeId: string;
  // The view last applied or saved, while other filters are applied and no
  // view has them ("modified"); "" otherwise.
  modifiedId: string;
  // A change couldn't be saved (the views shown are back to as last
  // saved); cleared by the next change that is.
  saveFailed: boolean;
  apply: (view: SavedFilterView) => void;
  // Back to no filters.
  clear: () => void;
  // The new view's id.
  saveCurrent: (name: string) => string;
  rename: (id: string, name: string) => void;
  // The view's filters become the current ones.
  update: (id: string) => void;
  remove: (id: string) => void;
  // Puts a deleted view back where it was (Undo); not when it's there.
  restore: (view: SavedFilterView, index: number) => void;
}

/**
 * Saved filter views (saved-filter-views.helpers.ts) for the filter bar,
 * kept in the user defaults by useSavedItemsStore (read again on focus,
 * each change applied to the views as saved then, one that can't be saved
 * undone and said).
 *
 * Applying one sets every filter the bar has - the search, the fields and
 * the lists - to the view's (no filter where it has none), through the
 * same setters the controls use, so the filters save as they always do.
 */
export function useSavedFilterViews(): SavedFilterViewsValue {
  const { values, setValue } = useFilterState();
  const { checkedByListId, setChecked } = useRowFilterSelection();
  const store = useSavedItemsStore<SavedFilterView>({
    key: SAVED_FILTER_VIEWS_KEY,
    read: readSavedFilterViews,
    toValue: toSavedFilterViewsValue,
  });
  const { items: views, add, edit, remove: removeView } = store;
  const [appliedId, setAppliedId] = useState('');

  const current = useMemo(() => toViewFilters(values, checkedByListId), [values, checkedByListId]);
  const { activeId, modifiedId } = getActiveAndModifiedIds(
    views,
    appliedId,
    (view) => isSameFilters(view.filters, current),
    hasAnyFilter(current),
  );

  const setFilters = useCallback(
    (filters: ViewFilters) => {
      VIEW_FIELD_KEYS.forEach((key) => setValue(key, filters.fields[key]));
      VIEW_LIST_IDS.forEach((id) => setChecked(id, filters.lists[id]));
    },
    [setValue, setChecked],
  );

  const apply = useCallback(
    (view: SavedFilterView) => {
      setFilters(view.filters);
      setAppliedId(view.id);
    },
    [setFilters],
  );

  const clear = useCallback(() => {
    setFilters(NO_FILTERS);
    setAppliedId('');
  }, [setFilters]);

  const saveCurrent = useCallback(
    (name: string) => {
      const view: SavedFilterView = { id: makeItemId('view'), name: name.trim(), filters: current };
      add(view);
      setAppliedId(view.id);
      return view.id;
    },
    [add, current],
  );

  const update = useCallback(
    (id: string) => {
      edit(id, { filters: current });
      setAppliedId(id);
    },
    [edit, current],
  );

  const remove = useCallback(
    (id: string) => {
      removeView(id);
      if (appliedId === id) setAppliedId('');
    },
    [appliedId, removeView],
  );

  return {
    views,
    current,
    activeId,
    modifiedId,
    saveFailed: store.saveFailed,
    apply,
    clear,
    saveCurrent,
    rename: store.rename,
    update,
    remove,
    restore: store.restore,
  };
}
