import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFilterState } from './FilterStateContext';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import {
  createPrUiOptionPersistenceHelpers,
  serializeOverridesUpdate,
} from '../helpers/pr-ui-option-persistence.helpers.ts';
import {
  SAVED_FILTER_VIEWS_KEY,
  VIEW_FIELD_KEYS,
  VIEW_LIST_IDS,
  hasAnyFilter,
  isSameFilters,
  makeViewId,
  readSavedFilterViews,
  toSavedFilterViewsValue,
  toViewFilters,
  type SavedFilterView,
  type ViewFilters,
} from '../helpers/saved-filter-views.helpers.ts';

const { readUiSessionOverridesOrNull, writeUiSessionOverrides } = createPrUiOptionPersistenceHelpers({
  fetch: (input, init) => fetch(input, init),
});

const NO_FILTERS = toViewFilters({}, {});

type ViewsChange = (views: SavedFilterView[]) => SavedFilterView[];

export interface SavedFilterViewsValue {
  // Null until read from the user defaults, and while they can't be (a
  // view saved then would be lost).
  views: SavedFilterView[] | null;
  // The filters applied now, as a view keeps them.
  current: ViewFilters;
  // The view whose filters are the current ones; "" when none is.
  activeId: string;
  // The view last applied or saved, while other filters are applied
  // ("modified"); "" otherwise.
  modifiedId: string;
  apply: (view: SavedFilterView) => void;
  // Back to no filters.
  clear: () => void;
  // The new view's id.
  saveCurrent: (name: string) => string;
  rename: (id: string, name: string) => void;
  // The view's filters become the current ones.
  update: (id: string) => void;
  remove: (id: string) => void;
}

/**
 * Saved filter views (saved-filter-views.helpers.ts) for the filter bar,
 * from the user defaults: read when the page loads and again whenever its
 * window regains focus (another browser or tab may have changed them).
 * Each change - add, rename, update, delete - shows at once, and is saved
 * by applying it to the views as saved then (read again, one at a time
 * with the other saves of the user defaults), so it doesn't write back
 * this page's older copy over a change made elsewhere.
 *
 * Applying one sets every filter the bar has - the search, the fields and
 * the lists - to the view's (no filter where it has none), through the
 * same setters the controls use, so the filters save as they always do.
 */
export function useSavedFilterViews(): SavedFilterViewsValue {
  const { values, setValue } = useFilterState();
  const { checkedByListId, setChecked } = useRowFilterSelection();
  const [views, setViews] = useState<SavedFilterView[] | null>(null);
  const [appliedId, setAppliedId] = useState('');

  useEffect(() => {
    let cancelled = false;
    // A read that fails keeps what's shown: nothing on the first, else the
    // views as last read.
    const load = async () => {
      const overrides = await readUiSessionOverridesOrNull();
      if (!cancelled && overrides) setViews(readSavedFilterViews(overrides));
    };
    void load();
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const current = useMemo(() => toViewFilters(values, checkedByListId), [values, checkedByListId]);
  const activeId = views?.find((view) => isSameFilters(view.filters, current))?.id || '';
  const modifiedId =
    appliedId && appliedId !== activeId && hasAnyFilter(current) && views?.some((view) => view.id === appliedId) ? appliedId : '';

  const setFilters = useCallback(
    (filters: ViewFilters) => {
      VIEW_FIELD_KEYS.forEach((key) => setValue(key, filters.fields[key]));
      VIEW_LIST_IDS.forEach((id) => setChecked(id, filters.lists[id]));
    },
    [setValue, setChecked],
  );

  const change = useCallback((transform: ViewsChange) => {
    setViews((previous) => (previous ? transform(previous) : previous));
    void serializeOverridesUpdate(async () => {
      const existing = await readUiSessionOverridesOrNull();
      if (!existing) return;
      const next = transform(readSavedFilterViews(existing));
      await writeUiSessionOverrides(
        { ...existing, [SAVED_FILTER_VIEWS_KEY]: toSavedFilterViewsValue(next) },
        { unchangedFrom: existing },
      );
      setViews(next);
    });
  }, []);

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
      const view: SavedFilterView = { id: makeViewId(), name: name.trim(), filters: current };
      change((list) => [...list, view]);
      setAppliedId(view.id);
      return view.id;
    },
    [change, current],
  );

  // A view deleted elsewhere in the meantime stays deleted.
  const rename = useCallback(
    (id: string, name: string) => change((list) => list.map((view) => (view.id === id ? { ...view, name: name.trim() } : view))),
    [change],
  );

  const update = useCallback(
    (id: string) => {
      change((list) => list.map((view) => (view.id === id ? { ...view, filters: current } : view)));
      setAppliedId(id);
    },
    [change, current],
  );

  const remove = useCallback(
    (id: string) => {
      change((list) => list.filter((view) => view.id !== id));
      if (appliedId === id) setAppliedId('');
    },
    [appliedId, change],
  );

  return { views, current, activeId, modifiedId, apply, clear, saveCurrent, rename, update, remove };
}
