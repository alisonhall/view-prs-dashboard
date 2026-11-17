import { useEffect, useMemo, useState } from 'react';
import { useActorIdentity } from './ActorIdentityContext';
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

// The filter bar's lists of people (the rest are labels).
const PEOPLE_ROW_FILTER_LISTS: ReadonlySet<string> = new Set(['author-list', 'assigned-list', 'approver-list']);

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

// A pick as the option it matches (by normalizeToken, when given), else as
// it is.
const optionValueFor = (
  options: ReadonlyArray<{ value?: unknown }> | null | undefined,
  normalizeToken?: (value: unknown) => unknown,
) => {
  const normalize = normalizeToken ?? ((value: unknown) => value);
  const byToken = new Map((options || []).map((option) => [normalize(option.value), String(option.value ?? '')]));
  return (pick: string) => byToken.get(normalize(pick)) ?? pick;
};

// Keeps these lists' selections (one selection Context) in step with their
// options; runs when the options or pending selections change, not when the
// selection does (it reads the selection as it rendered). A pick that
// matches an option becomes that option's value (labels ignore case; a
// person's login matches their key); one that matches none is kept as it
// is. With `keepUnmatched` (the rules' lists), a saved pick joins anything
// picked before it loaded rather than replacing it, and a pick matching an
// option becomes its value whenever the options change (a login saved
// before ids becomes its person's id once the people load).
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
        const current = Array.from(checkedByListId[listId] || []);
        // These lists are rules: a login ticked before the saved list loaded
        // joins it rather than replacing it (the next save would otherwise
        // write back only that one).
        const picks = Array.isArray(pendingSelections) ? [...pendingSelections.map(String), ...current] : current;
        const toOptionValue = optionValueFor(filterOptions[optionsKey], normalizeToken);
        const next = [...new Set(picks.map(toOptionValue))];
        if (Array.isArray(pendingSelections) || next.length !== current.length || next.some((value, index) => value !== current[index])) {
          setChecked(listId, next);
        }
        if (Array.isArray(pendingSelections)) setPendingMultiSelectSelection(pendingKey, null);
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

  // People's lists match by person: a saved login (or one of a person's
  // other logins) is their key, an id itself.
  const { normalizeActorLogin } = useActorIdentity();
  const byPerson = useMemo(
    () => (value: unknown) => String(normalizeActorLogin(value) || '').toLowerCase(),
    [normalizeActorLogin],
  );
  const rowFilterLists = useMemo(
    () => ROW_FILTER_LISTS.map((list) => (PEOPLE_ROW_FILTER_LISTS.has(list.listId) ? { ...list, normalizeToken: byPerson } : list)),
    [byPerson],
  );
  const threadLists = useMemo(
    () => [THREAD_RESOLUTION_ALLOW_LIST, THREAD_RESOLUTION_DENY_LIST].map((list) => ({ ...list, normalizeToken: byPerson })),
    [byPerson],
  );
  const changeFilterLists = useMemo(
    () => [IGNORE_COMMENT_AUTHORS_LIST, IGNORE_REVIEW_AUTHORS_LIST].map((list) => ({ ...list, normalizeToken: byPerson })),
    [byPerson],
  );

  useSeedLists(rowFilterLists, useRowFilterSelection(), pendingTick);
  useSeedLists(threadLists, useAuthorThreadResolutionSelection(), pendingTick, true);
  useSeedLists(changeFilterLists, useChangeFilterActorSelection(), pendingTick, true);
  return null;
}
