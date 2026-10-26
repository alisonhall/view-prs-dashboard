import { useEffect, useState } from 'react';
import { useFilterOptions } from './FilterOptionsContext';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import { ROW_FILTER_LISTS } from '../components/filter-bar/filter-bar-fields';
import { seedCheckedState } from '../helpers/pr-multi-select-checked-state.helpers.ts';
import {
  getPendingMultiSelectSelection,
  setPendingMultiSelectSelection,
  subscribeToPendingMultiSelectSelections,
} from '../helpers/pr-pending-multi-select-selections.helpers.ts';

/**
 * Keeps the five row-filter lists' selections (RowFilterSelectionContext)
 * in step with their options, whether or not the filter bar is open:
 * - a saved restore leaves a list's selection "pending" until its options
 *   load, then it's applied (and the pending entry cleared);
 * - when the options change (a data refresh), a checked value no longer
 *   among them is dropped, so the table isn't filtered by something the
 *   list can't show.
 *
 * Mount once, as <RowFilterListSeeding /> (below) beside the data
 * Providers - not inside the filter bar, so saved list filters apply and
 * stale ones drop whatever UI is mounted. MultiSelectListPortals does the
 * same for the Run & Filter tab's four rule lists, from their checkboxes
 * in the DOM.
 */
export function useRowFilterListSeeding(): void {
  const filterOptions = useFilterOptions();
  const { checkedByListId, setChecked } = useRowFilterSelection();
  const [pendingTick, setPendingTick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToPendingMultiSelectSelections(() => setPendingTick((tick) => tick + 1));
    return () => {
      unsubscribe();
    };
  }, []);

  // Runs when options or pending selections change, not when the selection
  // does (setChecked would loop): it reads the selection as it rendered.
  useEffect(() => {
    ROW_FILTER_LISTS.forEach(({ listId, optionsKey, pendingKey, normalizeToken }) => {
      const pendingSelections = getPendingMultiSelectSelection(pendingKey);
      const { items, shouldClearPending } = seedCheckedState(filterOptions[optionsKey], {
        existingChecked: Array.from(checkedByListId[listId] || []),
        pendingSelections: Array.isArray(pendingSelections) ? pendingSelections : null,
        normalizeToken,
      });
      setChecked(
        listId,
        items.filter((item) => item.checked).map((item) => item.value),
      );
      if (shouldClearPending) setPendingMultiSelectSelection(pendingKey, null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterOptions, pendingTick]);
}

// The hook as a component that renders nothing, for mounting in a tree.
export function RowFilterListSeeding(): null {
  useRowFilterListSeeding();
  return null;
}
