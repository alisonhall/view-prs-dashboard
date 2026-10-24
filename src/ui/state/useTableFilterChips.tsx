import { useContext, useMemo } from 'react';
import { FilterStateContext } from './FilterStateContext';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import { useDebouncedValue } from './useDebouncedValue';
import { FILTER_PR_NUMBERS_DEBOUNCE_MS } from './useVisiblePrNumbers';
import { createPrTableFilterChipsHelpers } from '../helpers/pr-table-filter-chips.helpers.ts';
import type { FilterValues } from './filterValuesStore';
import type { RowFilterListId } from './RowFilterSelectionContext';

const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

// Used without a <FilterStateProvider> ancestor, as useVisiblePrNumbers.jsx/
// useAppliedFilterSummary.tsx do. No openMode: it's a Run Script option,
// not a row-visibility filter (rowMatchesUiFilters never reads it), so a
// chip for it would falsely imply clearing it changes the table.
const DEFAULT_FILTER_STATE_VALUES: FilterValues = {
  scopeMode: 'all',
  filterPrNumbers: '',
  alwaysShowInReview: false,
  filterCustomComments: '',
  filterOtherNotes: '',
  filterPrDifficulty: '',
  filterRallyStories: '',
  filterRallyLinks: '',
  filterAnalysisOfPr: '',
};

/**
 * Drives the removable filter-chip row above the PR table (Data Views tab).
 * Composes the same two Contexts useVisiblePrNumbers.jsx reads for the row
 * filters themselves (FilterStateContext, RowFilterSelectionContext), so a
 * chip appears/disappears in lockstep with the filter it describes.
 *
 * Each returned chip's onRemove calls back into the exact same setters the
 * underlying form controls use (setValue for FilterStateContext fields,
 * toggle for RowFilterSelectionContext lists) - clearing a chip is
 * indistinguishable from the user unchecking/clearing the control itself.
 *
 * filterPrNumbers specifically is debounced here the same way
 * useVisiblePrNumbers.jsx/useAppliedFilterSummary.tsx both already debounce
 * it (same FILTER_PR_NUMBERS_DEBOUNCE_MS) - without this, the chip would
 * flicker through every intermediate keystroke (e.g. briefly showing
 * "PR #: 1" while typing "12") out of step with the table's own debounced
 * re-filter.
 */
export interface TableFilterChip {
  id: string;
  label: string;
  onRemove: () => void;
}

const asText = (value: unknown): string | undefined => (value === undefined ? undefined : String(value));

export function useTableFilterChips(): { chips: TableFilterChip[] } {
  const filterState = useContext(FilterStateContext);
  const values = filterState?.values || DEFAULT_FILTER_STATE_VALUES;
  const setValue = filterState?.setValue;
  const { checkedByListId, toggle } = useRowFilterSelection();
  const debouncedFilterPrNumbers = useDebouncedValue(asText(values.filterPrNumbers), FILTER_PR_NUMBERS_DEBOUNCE_MS);

  return useMemo(() => {
    const descriptors = buildTableFilterChipsViewModel({
      scopeMode: asText(values.scopeMode),
      filterPrNumbers: debouncedFilterPrNumbers,
      includeLabels: Array.from(checkedByListId['label-list'] || []),
      excludeLabels: Array.from(checkedByListId['exclude-label-list'] || []),
      authorLogins: Array.from(checkedByListId['author-list'] || []),
      assignedLogins: Array.from(checkedByListId['assigned-list'] || []),
      approverLogins: Array.from(checkedByListId['approver-list'] || []),
      alwaysShowInReview: Boolean(values.alwaysShowInReview),
      filterCustomComments: asText(values.filterCustomComments),
      filterOtherNotes: asText(values.filterOtherNotes),
      filterPrDifficulty: asText(values.filterPrDifficulty),
      filterRallyStories: asText(values.filterRallyStories),
      filterRallyLinks: asText(values.filterRallyLinks),
      filterAnalysisOfPr: asText(values.filterAnalysisOfPr),
    });

    const chips = descriptors.map((descriptor): TableFilterChip => ({
      id: descriptor.id,
      label: descriptor.label,
      onRemove: () => {
        if (descriptor.clear.kind === 'field') {
          setValue?.(descriptor.clear.key, descriptor.clear.value);
        } else if (descriptor.clear.kind === 'list') {
          toggle(descriptor.clear.listId as RowFilterListId, descriptor.clear.value);
        }
      },
    }));

    return { chips };
  }, [values, debouncedFilterPrNumbers, checkedByListId, setValue, toggle]);
}
