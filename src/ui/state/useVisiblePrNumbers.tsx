import { useContext, useMemo, useRef } from 'react';
import { usePrData } from './PrDataContext';
import { FilterStateContext } from './FilterStateContext';
import { useNeedsAttention } from './NeedsAttentionContext';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import { useActorIdentity } from './ActorIdentityContext';
import { useDebouncedValue } from './useDebouncedValue';
import type { FilterValues } from './filterValuesStore';
import { createPrScopeSelectionHelpers } from '../helpers/pr-scope-selection.helpers.ts';
import { createPrRowFilteringHelpers } from '../helpers/pr-row-filtering.helpers.ts';
import { createPrRowMatchFiltersHelpers } from '../helpers/pr-row-match-filters.helpers.ts';
import {
  createPrVisiblePrNumbersHelpers,
  type VisiblePrNumbersResult,
} from '../helpers/pr-visible-pr-numbers.helpers.ts';
import { createPrAssignedUsersHelpers } from '../helpers/pr-assigned-users.helpers.ts';
import { createPrApproversHelpers } from '../helpers/pr-approvers.helpers.ts';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';
import { asArray } from '../helpers/pr-as-array.helpers.ts';
import { extractRowLabelNames, normalizeFilterToken } from '../helpers/pr-filter-label-extraction.helpers.ts';
import { getManualNotesFieldSummary } from '../helpers/pr-manual-notes-summary.helpers.ts';
import { createEntryDerivedCache, type EntryDerivedCache } from '../helpers/pr-entry-derived-cache.helpers.ts';
import type { PrData } from '../types/pr-data.ts';

const { formatIsoDatetime } = createPrFormattingHelpers();

// `inReview` is stored as a STRING throughout the data pipeline
// (view-prs-data-helpers.js's "false" default; view-prs-mutation-route-
// helpers.js's toTrimmedString on every write), so a plain
// `Boolean(row.inReview)` would treat the literal string "false" as true.
const isInReviewEnabled = (row: PrData): boolean => {
  const value: unknown = row?.inReview;
  return value === true || String(value || '').toLowerCase() === 'true';
};

// How long the PR-number filter waits after typing. Exported so
// useAppliedFilterSummary.tsx and useTableFilterChips.tsx debounce their
// display of it the same way; otherwise their text would disagree with the
// (debounced) table while typing.
export const FILTER_PR_NUMBERS_DEBOUNCE_MS = 150;

// Used when there's no <FilterStateProvider> ancestor at all (e.g.
// integration-tests/index.html.test.js's isolated PrTableApp mount, which
// deliberately never mounts one).
const DEFAULT_FILTER_STATE_VALUES: FilterValues = {
  scopeMode: 'all',
  filterPrNumbers: '',
  alwaysShowInReview: false,
  filterCustomComments: '',
  filterOtherNotes: '',
  filterPrDifficulty: '',
  filterStories: '',
  filterAnalysisOfPr: '',
};

/**
 * Which PRs the table shows for the current filters, derived live from
 * Context on every render (useMemo). Called directly inside PrTableApp
 * (which already sits inside every Context this reads), not routed through
 * a component pushing into PrDataProvider's state, to avoid the
 * stable-children reconciliation-bailout bug NeedsAttentionProvider.tsx
 * had to work around (see its comment).
 *
 * Composes the pure row-filtering helpers (resolveScopedRows/
 * buildRowFilterCriteria/applyRowUiFilters/rowMatchesUiFilters), with the
 * actor-identity pieces (collectAssignedUsers/collectApproversFromRow/
 * getPreferredActorKey) from useActorIdentity() and attentionConfig/
 * entryNeedsAttention/entryHasYourLastActivity from useNeedsAttention().
 * Per-entry results are cached across renders (createEntryDerivedCache).
 *
 * Returns `{ visiblePrNumbers, scopeLabel }`: `scopeLabel` (e.g. "all
 * stored rows"/"needs attention rows") falls out of the same scope pass and
 * feeds the "Applied filters" text (useAppliedFilterSummary.tsx calls this
 * same hook rather than re-deriving scope).
 *
 * `filterPrNumbers` is debounced (FILTER_PR_NUMBERS_DEBOUNCE_MS) so typing
 * a PR number doesn't re-filter on every keystroke and flicker through
 * wrong intermediate matches (typing "12" would briefly show PR #1). The
 * other fields are discrete clicks/selections, so they aren't debounced.
 *
 * Reads FilterStateContext directly (not the throwing useFilterState()),
 * falling back to DEFAULT_FILTER_STATE_VALUES, so it works without a
 * <FilterStateProvider> ancestor (see above). The real app always has one.
 */
export function useFilteredPrRows(): VisiblePrNumbersResult {
  const { payload } = usePrData();
  const filterState = useContext(FilterStateContext);
  const values = filterState?.values || DEFAULT_FILTER_STATE_VALUES;
  const { attentionConfig, entryNeedsAttention, entryHasYourLastActivity } = useNeedsAttention();
  const { checkedByListId } = useRowFilterSelection();
  const { normalizeActorLogin, resolveActorDisplayName, getPreferredActorKey } = useActorIdentity();
  const debouncedFilterPrNumbers = useDebouncedValue(values.filterPrNumbers, FILTER_PR_NUMBERS_DEBOUNCE_MS);

  const cacheRef = useRef<EntryDerivedCache | null>(null);
  if (!cacheRef.current) {
    cacheRef.current = createEntryDerivedCache();
  }
  // Set just above and never replaced.
  const cache = cacheRef.current;

  const helpers = useMemo(() => {
    const { resolveScopedRows, normalizeSelectedScope } = createPrScopeSelectionHelpers({
      entryNeedsAttention,
      entryHasYourLastActivity,
    });
    const { collectAssignedUsers } = createPrAssignedUsersHelpers({
      asArray,
      normalizeActorLogin,
      resolveActorDisplayName,
    });
    const { collectApproversFromRow } = createPrApproversHelpers({
      asArray,
      getPreferredActorKey,
      resolveActorDisplayName,
      formatIsoDatetime,
    });
    const { rowMatchesUiFilters } = createPrRowMatchFiltersHelpers({
      getPreferredActorKey,
      collectAssignedUsers,
      collectApproversFromRow,
      extractRowLabelNames,
      normalizeFilterToken,
      getManualNotesFieldSummary,
      isInReviewEnabled,
    });
    const { buildRowFilterCriteria, applyRowUiFilters } = createPrRowFilteringHelpers({
      rowMatchesUiFilters,
      getOrCompute: cache.getOrCompute,
      getOrComputeLatest: cache.getOrComputeLatest,
    });
    return createPrVisiblePrNumbersHelpers({
      resolveScopedRows,
      normalizeSelectedScope,
      buildRowFilterCriteria,
      applyRowUiFilters,
    });
  }, [
    cache,
    entryNeedsAttention,
    entryHasYourLastActivity,
    normalizeActorLogin,
    resolveActorDisplayName,
    getPreferredActorKey,
  ]);

  return useMemo(
    () =>
      helpers.computeVisiblePrNumbers({
        payload,
        scopeMode: values.scopeMode,
        filterPrNumbersRaw: debouncedFilterPrNumbers,
        attentionConfig,
        rowFilterSelections: {
          includeLabels: Array.from(checkedByListId['label-list'] || []),
          excludeLabels: Array.from(checkedByListId['exclude-label-list'] || []),
          authorLogins: Array.from(checkedByListId['author-list'] || []),
          assignedLogins: Array.from(checkedByListId['assigned-list'] || []),
          approverLogins: Array.from(checkedByListId['approver-list'] || []),
        },
        alwaysShowInReview: values.alwaysShowInReview,
        customComments: values.filterCustomComments,
        otherNotes: values.filterOtherNotes,
        prDifficulty: values.filterPrDifficulty,
        stories: values.filterStories,
        analysisOfPr: values.filterAnalysisOfPr,
      }),
    [helpers, payload, values, attentionConfig, checkedByListId, debouncedFilterPrNumbers],
  );
}

// PrTableApp's entry point: just the visible PR numbers.
export function useVisiblePrNumbers(): string[] {
  return useFilteredPrRows().visiblePrNumbers;
}
