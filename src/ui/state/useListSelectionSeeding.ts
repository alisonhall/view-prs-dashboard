import { useEffect, useState } from 'react';
import { useFilterOptions, type FilterOptionsValue } from './FilterOptionsContext';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import { useAuthorThreadResolutionSelection } from './AuthorThreadResolutionSelectionContext';
import { useChangeFilterActorSelection } from './ChangeFilterActorSelectionContext';
import type { CheckedByListIdValue } from './useCheckedByListIdState';
import { ROW_FILTER_LISTS } from '../components/filter-bar/filter-bar-fields';
import {
  IGNORE_COMMENT_AUTHORS_LIST,
  IGNORE_REVIEW_AUTHORS_LIST,
  THREAD_RESOLUTION_ALLOW_LIST,
  THREAD_RESOLUTION_DENY_LIST,
} from '../components/settings/settings-fields';
import { seedCheckedState } from '../helpers/pr-multi-select-checked-state.helpers.ts';
import {
  getPendingMultiSelectSelection,
  setPendingMultiSelectSelection,
  subscribeToPendingMultiSelectSelections,
} from '../helpers/pr-pending-multi-select-selections.helpers.ts';

interface SeededList<L extends string> {
  listId: L;
  optionsKey: keyof FilterOptionsValue;
  pendingKey: string;
  normalizeToken?: (value: unknown) => unknown;
}

// The picks no option matches (by normalizeToken, when given), as they
// are.
const unmatchedSelections = (
  options: ReadonlyArray<{ value?: unknown }> | null | undefined,
  selections: unknown,
  normalizeToken?: (value: unknown) => unknown,
): string[] => {
  const normalize = normalizeToken ?? ((value: unknown) => value);
  const known = new Set((options || []).map((option) => normalize(option.value)));
  return (Array.isArray(selections) ? selections : [])
    .map((value) => String(value ?? '').trim())
    .filter((value) => value && !known.has(normalize(value)));
};

// Keeps these lists' selections (one selection Context) in step with their
// options; runs when the options or pending selections change, not when the
// selection does (it reads the selection as it rendered). A pick that
// matches an option becomes that option's value (labels ignore case); one
// that matches none is kept as it is. With `keepUnmatched` (the rules'
// lists), a saved pick joins anything picked before it loaded rather than
// replacing it.
function useSeedLists<L extends string>(
  lists: ReadonlyArray<SeededList<L>>,
  selection: CheckedByListIdValue<L>,
  pendingTick: number,
  keepUnmatched = false,
) {
  const filterOptions = useFilterOptions();
  const { checkedByListId, setChecked } = selection;
  useEffect(() => {
    lists.forEach(({ listId, optionsKey, pendingKey, normalizeToken }) => {
      const pendingSelections = getPendingMultiSelectSelection(pendingKey);
      if (keepUnmatched) {
        if (!Array.isArray(pendingSelections)) return;
        // These lists are rules: a login ticked before the saved list loaded
        // joins it rather than replacing it (the next save would otherwise
        // write back only that one).
        const current = Array.from(checkedByListId[listId] || []);
        setChecked(listId, [...new Set([...pendingSelections.map(String), ...current])]);
        setPendingMultiSelectSelection(pendingKey, null);
        return;
      }
      // A restored selection replaces the current one, and applies at once.
      const existingChecked = Array.isArray(pendingSelections) ? [] : Array.from(checkedByListId[listId] || []);
      const { items } = seedCheckedState(filterOptions[optionsKey], {
        existingChecked,
        pendingSelections: Array.isArray(pendingSelections) ? pendingSelections : null,
        normalizeToken,
      });
      setChecked(listId, [
        ...items.filter((item) => item.checked).map((item) => item.value),
        ...unmatchedSelections(filterOptions[optionsKey], existingChecked.length ? existingChecked : pendingSelections, normalizeToken),
      ]);
      if (Array.isArray(pendingSelections)) setPendingMultiSelectSelection(pendingKey, null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterOptions, pendingTick]);
}

/**
 * Keeps every multi-select list's selection in step with its options,
 * whatever UI is mounted: the filter bar's five row filters
 * (RowFilterSelectionContext), and the Settings drawer's thread-resolution
 * allow/deny lists (AuthorThreadResolutionSelectionContext) and
 * change-detection author lists (ChangeFilterActorSelectionContext).
 * - A saved restore ("pending") is applied at once, whether or not the
 *   options have loaded, and the pending entry cleared.
 * - A checked value no loaded PR has (a saved view's author with no open
 *   PRs, a label from another repo) stays checked, so the filter keeps
 *   applying; the filter bar lists it so it can be unticked
 *   (FilterMultiSelect). One that matches an option once it loads becomes
 *   that option's value. Unchanged selections leave their Context as it
 *   was (useCheckedByListIdState), so a poll doesn't re-filter or re-save.
 * - The Settings drawer's lists are rules, not filters: a saved login stays
 *   picked (and saved) whether or not the loaded data has that actor - a
 *   bot often doesn't - and joins anything picked before it loaded.
 *
 * Renders nothing; mount once inside FilterOptionsProvider and the three
 * selection Providers.
 */
export function ListSelectionSeeding(): null {
  const [pendingTick, setPendingTick] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeToPendingMultiSelectSelections(() => setPendingTick((tick) => tick + 1));
    return () => {
      unsubscribe();
    };
  }, []);

  useSeedLists(ROW_FILTER_LISTS, useRowFilterSelection(), pendingTick);
  useSeedLists([THREAD_RESOLUTION_ALLOW_LIST, THREAD_RESOLUTION_DENY_LIST], useAuthorThreadResolutionSelection(), pendingTick, true);
  useSeedLists([IGNORE_COMMENT_AUTHORS_LIST, IGNORE_REVIEW_AUTHORS_LIST], useChangeFilterActorSelection(), pendingTick, true);
  return null;
}
