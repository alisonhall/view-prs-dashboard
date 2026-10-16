import { useContext, useMemo } from 'react';
import { usePrData } from './PrDataContext';
import { FilterStateContext } from './FilterStateContext';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import { useJobEvents } from './JobEventsContext';
import { useFilteredPrRows, FILTER_PR_NUMBERS_DEBOUNCE_MS } from './useVisiblePrNumbers';
import { useDebouncedValue } from './useDebouncedValue';
import { createPrSelectedFiltersHelpers } from '../helpers/pr-selected-filters.helpers.js';
import { createPrAppliedSummaryHelpers } from '../helpers/pr-applied-summary.helpers.js';

const { buildSelectedFiltersViewModel } = createPrSelectedFiltersHelpers();
const { buildAppliedSummaryViewModel } = createPrAppliedSummaryHelpers();

// Same permissive "no <FilterStateProvider> ancestor" fallback
// useVisiblePrNumbers.jsx's own hook uses - see that file's comment for
// why (integration-tests/index.html.test.js's isolated mounts).
const DEFAULT_FILTER_STATE_VALUES = {
  openMode: 'none',
  alwaysShowInReview: false,
  filterPrNumbers: '',
};

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering" follow-up): the
 * reactive replacement for the "Applied filters" chip/summary text's
 * imperative push bridge (window.renderReactFilterSummary -> react-app.jsx's
 * local useState -> <AppliedFilterSummary> props). Composes:
 * - useFilteredPrRows() (useVisiblePrNumbers.jsx) for the filtered row
 *   count and scopeLabel - the exact same live derivation the table
 *   itself uses, so this text never disagrees with what's actually shown.
 * - RowFilterSelectionContext's checked multi-selects, run through the
 *   same buildSelectedFiltersViewModel the vanilla pipeline uses, to get
 *   the comma-joined display strings (not raw arrays).
 * - FilterStateContext's openMode/alwaysShowInReview (cosmetic-only
 *   openMode is still Context-backed even though it plays no row-filtering
 *   role - see pr-row-match-filters.helpers.js's own comment).
 * - useJobEvents().schedulerSummary (see pr-job-events.helpers.js's
 *   extractSchedulerSummary) for the scheduler portion of the text - the
 *   one piece that previously had NO reactive source at all anywhere,
 *   landed as its own prerequisite slice before this hook could exist.
 *
 * `filterPrNumbers` for display is debounced the exact same way
 * useFilteredPrRows() debounces it internally (same
 * FILTER_PR_NUMBERS_DEBOUNCE_MS) - without this, the chip text's
 * "pr-numbers=..." entry (if read raw/undebounced) and its "Rows: N"
 * entry (from useFilteredPrRows(), debounced) would visibly disagree with
 * each other while typing a multi-digit PR number. Found via code review
 * after this hook first shipped reading the raw value directly.
 *
 * Must be called from somewhere inside both <RowFilterSelectionProvider>
 * and <JobEventsProvider> - true for every call site this hook actually
 * has (the prTable portal, and the appliedFilterSummary portal, both
 * widened to sit inside those Providers for exactly this reason - see
 * react-app.jsx's own comment at JobEventsProvider).
 */
export function useAppliedFilterSummary() {
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
