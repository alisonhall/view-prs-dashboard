import { useContext, useMemo } from 'react';
import { usePrData } from './PrDataContext';
import { FilterStateContext } from './FilterStateContext';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import { useJobEvents } from './JobEventsContext';
import { useFilteredPrRows, FILTER_PR_NUMBERS_DEBOUNCE_MS } from './useVisiblePrNumbers';
import { useDebouncedValue } from './useDebouncedValue';
import { createPrSelectedFiltersHelpers } from '../helpers/pr-selected-filters.helpers.ts';
import { createPrAppliedSummaryHelpers } from '../helpers/pr-applied-summary.helpers.ts';
import type { FilterValues } from './filterValuesStore';

const { buildSelectedFiltersViewModel } = createPrSelectedFiltersHelpers();
const { buildAppliedSummaryViewModel } = createPrAppliedSummaryHelpers();

// Used without a <FilterStateProvider> ancestor, as useVisiblePrNumbers.tsx
// is - see that file's comment for why (integration-tests/index.html.test.js's
// isolated mounts).
const DEFAULT_FILTER_STATE_VALUES: FilterValues = {
  openMode: 'none',
  alwaysShowInReview: false,
  filterPrNumbers: '',
};

/**
 * The "Applied filters" summary text and chips. Composes:
 * - useFilteredPrRows() (useVisiblePrNumbers.tsx) for the filtered row
 *   count and scopeLabel - the same live derivation the table uses, so
 *   this text never disagrees with what's shown.
 * - RowFilterSelectionContext's checked multi-selects, run through
 *   buildSelectedFiltersViewModel for the comma-joined display strings.
 * - FilterStateContext's openMode/alwaysShowInReview (openMode is shown
 *   though it plays no row-filtering role - see
 *   pr-row-match-filters.helpers.ts's comment).
 * - useJobEvents().schedulerSummary for the scheduler part of the text.
 *
 * `filterPrNumbers` for display is debounced the exact same way
 * useFilteredPrRows() debounces it internally (same
 * FILTER_PR_NUMBERS_DEBOUNCE_MS) - without this, the chip text's
 * "pr-numbers=..." entry (if read raw/undebounced) and its "Rows: N"
 * entry (from useFilteredPrRows(), debounced) would visibly disagree with
 * each other while typing a multi-digit PR number.
 *
 * Must be called from somewhere inside both <RowFilterSelectionProvider>
 * and <JobEventsProvider> - true for every call site this hook actually
 * has (the prTable portal, and the appliedFilterSummary portal, both
 * widened to sit inside those Providers for exactly this reason - see
 * react-app.jsx's own comment at JobEventsProvider).
 */
export function useAppliedFilterSummary(): { summaryText: string; filterChips: string[] } {
  const { payload, selectedRepo } = usePrData();
  const { visiblePrNumbers, scopeLabel } = useFilteredPrRows();
  const { checkedByListId } = useRowFilterSelection();
  const { schedulerSummary } = useJobEvents();
  const filterState = useContext(FilterStateContext);
  const values = filterState?.values || DEFAULT_FILTER_STATE_VALUES;
  const debouncedFilterPrNumbers = useDebouncedValue(values.filterPrNumbers, FILTER_PR_NUMBERS_DEBOUNCE_MS);

  return useMemo(() => {
    const selectedFilters = buildSelectedFiltersViewModel({
      selectedIncludeLabelNames: Array.from(checkedByListId['label-list'] || []),
      selectedExcludeLabelNames: Array.from(checkedByListId['exclude-label-list'] || []),
      selectedAuthorLogins: Array.from(checkedByListId['author-list'] || []),
      selectedAssignedLogins: Array.from(checkedByListId['assigned-list'] || []),
      selectedApproverLogins: Array.from(checkedByListId['approver-list'] || []),
      openModeFilter: values.openMode,
      alwaysShowInReview: values.alwaysShowInReview,
    });

    const { appliedSummaryText, filterChips } = buildAppliedSummaryViewModel({
      repoFilter: selectedRepo,
      scopeLabel,
      filterPrNumbersRaw: debouncedFilterPrNumbers,
      includeLabelFilter: selectedFilters.includeLabelFilter,
      excludeLabelFilter: selectedFilters.excludeLabelFilter,
      authorFilter: selectedFilters.authorFilter,
      assignedFilter: selectedFilters.assignedFilter,
      approverFilter: selectedFilters.approverFilter,
      alwaysShowInReview: selectedFilters.alwaysShowInReview,
      openModeFilter: selectedFilters.openModeFilter,
      rowsCount: visiblePrNumbers.length,
      lastRunUpdatedAt: payload?.lastRun?.updatedAt,
      scheduler: schedulerSummary,
    });

    return { summaryText: appliedSummaryText, filterChips };
  }, [
    selectedRepo,
    scopeLabel,
    visiblePrNumbers,
    payload,
    checkedByListId,
    values,
    debouncedFilterPrNumbers,
    schedulerSummary,
  ]);
}
