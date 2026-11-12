import { useContext } from 'react';
import { picksArchivedOnlyOption, tableArchiveSections, type ArchivedSection } from '../helpers/pr-archive.helpers.ts';
import { normalizeFilterToken } from '../helpers/pr-filter-label-extraction.helpers.ts';
import { FilterOptionsContext } from './FilterOptionsContext';
import { FilterStateContext } from './FilterStateContext';
import { usePrArchive } from './PrArchiveContext';
import { RowFilterSelectionContext } from './RowFilterSelectionContext';
import { useDebouncedValue } from './useDebouncedValue';
import { FILTER_PR_NUMBERS_DEBOUNCE_MS, FILTER_SEARCH_DEBOUNCE_MS } from './useVisiblePrNumbers';

/**
 * The archived sections the table adds (tableArchiveSections): those whose
 * "Show older" was pressed, and every one while the search or PR number
 * field has something in it, or an author or label only archived PRs have
 * is ticked (FilterOptionsProvider lists them under "Only in archived PRs").
 *
 * Timed to the table's own filtering, which uses the fields debounced
 * (useFilteredPrRows): on the raw text, the first letter typed would add
 * every archived PR before the search filtered them, a flash of hundreds of
 * rows. So they're added with the same debounce - the table's timer, set
 * first (a child's effects run before its parent's) with the same delay,
 * fires first, so the filter is there when they arrive - and taken away as
 * soon as the field is cleared, before the table shows every row again. A
 * ticked option filters the table at once, so it needs no wait.
 */
export function useTableArchiveSections(): ReadonlySet<ArchivedSection> {
  const { shownSections } = usePrArchive();
  const values = useContext(FilterStateContext)?.values;
  const { authorOptions, labelOptions } = useContext(FilterOptionsContext);
  const checkedByListId = useContext(RowFilterSelectionContext)?.checkedByListId;
  const filterSearch = String(values?.filterSearch || '');
  const filterPrNumbers = String(values?.filterPrNumbers || '');
  const debouncedSearch = useDebouncedValue(filterSearch, FILTER_SEARCH_DEBOUNCE_MS);
  const debouncedPrNumbers = useDebouncedValue(filterPrNumbers, FILTER_PR_NUMBERS_DEBOUNCE_MS);
  const picksArchivedOnly =
    picksArchivedOnlyOption(authorOptions, checkedByListId?.['author-list']) ||
    picksArchivedOnlyOption(labelOptions, checkedByListId?.['label-list'], normalizeFilterToken);
  return tableArchiveSections(
    shownSections,
    {
      filterSearch: filterSearch.trim() ? debouncedSearch : '',
      filterPrNumbers: filterPrNumbers.trim() ? debouncedPrNumbers : '',
    },
    picksArchivedOnly,
  );
}
