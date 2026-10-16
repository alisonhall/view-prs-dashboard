import { useContext, useMemo, useRef } from 'react';
import { usePrData } from './PrDataContext';
import { FilterStateContext } from './FilterStateContext';
import { useNeedsAttention } from './NeedsAttentionContext';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import { useActorIdentity } from './ActorIdentityContext';
import { useDebouncedValue } from './useDebouncedValue';
import { createPrScopeSelectionHelpers } from '../helpers/pr-scope-selection.helpers.js';
import { createPrRowFilteringHelpers } from '../helpers/pr-row-filtering.helpers.js';
import { createPrRowMatchFiltersHelpers } from '../helpers/pr-row-match-filters.helpers.js';
import { createPrVisiblePrNumbersHelpers } from '../helpers/pr-visible-pr-numbers.helpers.js';
import { createPrAssignedUsersHelpers } from '../helpers/pr-assigned-users.helpers.js';
import { createPrApproversHelpers } from '../helpers/pr-approvers.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { asArray } from '../helpers/pr-as-array.helpers.js';
import { extractRowLabelNames, normalizeFilterToken } from '../helpers/pr-filter-label-extraction.helpers.js';
import { getManualNotesFieldSummary } from '../helpers/pr-manual-notes-summary.helpers.js';
import { createEntryDerivedCache } from '../helpers/pr-entry-derived-cache.helpers.js';

const { formatIsoDatetime } = createPrFormattingHelpers();

// Verbatim copy of index.page.js's own isInReviewEnabled (not exported as
// its own module, so can't be imported directly) - `inReview` is stored as
// a STRING throughout the real data pipeline (view-prs-data-helpers.js's
// own "false" default; view-prs-mutation-route-helpers.js's toTrimmedString
// on every write), so a plain `Boolean(row.inReview)` is wrong: it would
// treat the literal string "false" as truthy. Found via code review after
// this hook first shipped with that wrong simplified version.
const isInReviewEnabled = (row) => {
  const value = row?.inReview;
  return value === true || String(value || '').toLowerCase() === 'true';
};

// Same delay FilterStateProvider's own debounced-apply effect already
// uses (DEBOUNCE_MS there) - not imported directly since that module
// doesn't export the constant, just kept in sync by convention. Exported
// so useAppliedFilterSummary.jsx can debounce its own
// filterPrNumbersRaw-for-display the same way - without this, its chip
// text's "pr-numbers=..." entry (undebounced) and "Rows: N" entry (from
// useFilteredPrRows() below, debounced) would visibly disagree with each
// other while typing. Found via code review.
export const FILTER_PR_NUMBERS_DEBOUNCE_MS = 150;

// Matches every other Context-migrated filter field's own "no override
// yet" fallback (same shape as getFilterStateOverrideForFieldId's DOM
// fallback, index.page.js) - used when there's no <FilterStateProvider>
// ancestor at all (e.g. integration-tests/index.html.test.js's isolated
// PrTableApp mount, which deliberately never mounts one - see that file's
// own comment at its mountReactPrTable stub).
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
 * Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering"): the reactive
 * replacement for the vanilla pipeline's imperatively-pushed
 * `visiblePrNumbers` (index.page.js's renderPrData -> prDataTabOrchestrator
 * -> deriveRenderFilterSummaryState, previously the only way the table's
 * visible rows ever changed - on an explicit "Apply filters" click, or a
 * handful of fields' 150ms-debounced auto-apply). Every filter criterion
 * composed here is already reactive Context state somewhere in the tree;
 * this hook just derives the same `visiblePrNumbers` result live, every
 * render, via useMemo - called directly inside PrTableApp (which already
 * sits inside every Context this composes), not routed through an
 * intermediate "bridge" component pushing into PrDataProvider's own state,
 * to avoid the stable-children reconciliation-bailout bug class
 * NeedsAttentionProvider.jsx had to work around previously (see that
 * file's own comment).
 *
 * Reuses the exact same pure helpers the vanilla pipeline uses
 * (resolveScopedRows/buildRowFilterCriteria/applyRowUiFilters/
 * rowMatchesUiFilters) - only the actor-identity-dependent pieces
 * (collectAssignedUsers/collectApproversFromRow/getPreferredActorKey) are
 * built from useActorIdentity()'s Context-derived functions instead of
 * index.page.js's own mutable currentActorLoginAliases/currentViewerLogin
 * module `let`s, since those aren't reachable from React. attentionConfig
 * + entryNeedsAttention/entryHasYourLastActivity come from
 * useNeedsAttention(), already reactive the same way.
 *
 * Returns `{ visiblePrNumbers, scopeLabel }`, not just the table's visible
 * set - `scopeLabel` (e.g. "all stored rows"/"needs attention rows") falls
 * out of the same scope-resolution pass and feeds the "Applied filters"
 * chip text's "scope=..." entry (see useAppliedFilterSummary.jsx, which
 * calls this same hook rather than re-deriving scope on its own).
 *
 * `filterPrNumbers` specifically is debounced (useDebouncedValue, same
 * 150ms as FilterStateProvider's own debounced-apply effect) before being
 * used here - found via code review that without this, every keystroke
 * while typing a PR number re-filters the table immediately, visibly
 * flickering through wrong intermediate matches (typing "12" would briefly
 * show PR #1 before showing PR #12). Every other field this hook reads is
 * a discrete click/selection (scope, the 5 multi-selects, the 6 "Any"
 * selects), not prone to that same rapid-fire-keystroke churn, so this is
 * deliberately not applied generically to every field.
 *
 * Reads FilterStateContext directly (not the throwing useFilterState()
 * hook) with DEFAULT_FILTER_STATE_VALUES as a fallback, so this works
 * without a <FilterStateProvider> ancestor too - needed for
 * integration-tests/index.html.test.js's isolated PrTableApp mount (see
 * that file's own comment). Every real-app render always has a real
 * Provider, so this fallback is never exercised there.
 */
export function useFilteredPrRows() {
  const { payload } = usePrData();
  const filterState = useContext(FilterStateContext);
  const values = filterState?.values || DEFAULT_FILTER_STATE_VALUES;
  const { attentionConfig, entryNeedsAttention, entryHasYourLastActivity } = useNeedsAttention();
  const { checkedByListId } = useRowFilterSelection();
  const { normalizeActorLogin, resolveActorDisplayName, getPreferredActorKey } = useActorIdentity();
  const debouncedFilterPrNumbers = useDebouncedValue(values.filterPrNumbers, FILTER_PR_NUMBERS_DEBOUNCE_MS);

  const cacheRef = useRef(null);
  if (!cacheRef.current) {
    cacheRef.current = createEntryDerivedCache();
  }

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
      getOrCompute: cacheRef.current.getOrCompute,
    });
    return createPrVisiblePrNumbersHelpers({
      resolveScopedRows,
      normalizeSelectedScope,
      buildRowFilterCriteria,
      applyRowUiFilters,
    });
  }, [
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
        rallyStories: values.filterRallyStories,
        rallyLinks: values.filterRallyLinks,
        analysisOfPr: values.filterAnalysisOfPr,
      }),
    [helpers, payload, values, attentionConfig, checkedByListId, debouncedFilterPrNumbers],
  );
}

/**
 * `PrTableApp`'s own entry point - same hook as before this file also
 * started exporting `useFilteredPrRows`, just narrowed to the one field
 * it actually needs.
 */
export function useVisiblePrNumbers() {
  return useFilteredPrRows().visiblePrNumbers;
}
