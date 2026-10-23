import { useContext, useMemo } from 'react';
import { FilterStateContext } from './FilterStateContext';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import { useDebouncedValue } from './useDebouncedValue';
import { FILTER_PR_NUMBERS_DEBOUNCE_MS } from './useVisiblePrNumbers';
import { createPrTableFilterChipsHelpers } from '../helpers/pr-table-filter-chips.helpers.ts';

const { buildTableFilterChipsViewModel } = createPrTableFilterChipsHelpers();

// Same permissive "no <FilterStateProvider> ancestor" fallback
// useVisiblePrNumbers.jsx/useAppliedFilterSummary.jsx already use.
// No openMode here - unlike every other field below, openMode is a Run
// Script option (OpenModeSelect.jsx's own header comment: read via
// FormData when the backend script runs), not a row-visibility filter -
// it's never referenced by rowMatchesUiFilters/useVisiblePrNumbers.jsx, so
// a chip for it would falsely imply clearing it changes the table. Found
// via code review after this hook first shipped including it.
const DEFAULT_FILTER_STATE_VALUES = {
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
 * useVisiblePrNumbers.jsx/useAppliedFilterSummary.jsx both already debounce
 * it (same FILTER_PR_NUMBERS_DEBOUNCE_MS) - without this, the chip would
 * flicker through every intermediate keystroke (e.g. briefly showing
 * "PR #: 1" while typing "12") out of step with the table's own debounced
 * re-filter. Found via code review.
 */
export function useTableFilterChips() {
  const filterState = useContext(FilterStateContext);
  const values = filterState?.values || DEFAULT_FILTER_STATE_VALUES;
  const setValue = filterState?.setValue;
  const { checkedByListId, toggle } = useRowFilterSelection();
  const debouncedFilterPrNumbers = useDebouncedValue(values.filterPrNumbers, FILTER_PR_NUMBERS_DEBOUNCE_MS);

  return useMemo(() => {
    const descriptors = buildTableFilterChipsViewModel({
      scopeMode: values.scopeMode,
      filterPrNumbers: debouncedFilterPrNumbers,
      includeLabels: Array.from(checkedByListId['label-list'] || []),
      excludeLabels: Array.from(checkedByListId['exclude-label-list'] || []),
      authorLogins: Array.from(checkedByListId['author-list'] || []),
      assignedLogins: Array.from(checkedByListId['assigned-list'] || []),
      approverLogins: Array.from(checkedByListId['approver-list'] || []),
      alwaysShowInReview: values.alwaysShowInReview,
      filterCustomComments: values.filterCustomComments,
      filterOtherNotes: values.filterOtherNotes,
      filterPrDifficulty: values.filterPrDifficulty,
      filterRallyStories: values.filterRallyStories,
      filterRallyLinks: values.filterRallyLinks,
      filterAnalysisOfPr: values.filterAnalysisOfPr,
    });

    const chips = descriptors.map((descriptor) => ({
      id: descriptor.id,
      label: descriptor.label,
      onRemove: () => {
        if (descriptor.clear.kind === 'field') {
          setValue?.(descriptor.clear.key, descriptor.clear.value);
        } else if (descriptor.clear.kind === 'list') {
          toggle(descriptor.clear.listId, descriptor.clear.value);
        }
      },
    }));

    return { chips };
  }, [values, debouncedFilterPrNumbers, checkedByListId, setValue, toggle]);
}
