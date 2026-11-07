import { useContext, useMemo, useRef } from 'react';
import { usePrData } from './PrDataContext';
import { FilterStateContext } from './FilterStateContext';
import { useNeedsAttention } from './NeedsAttentionContext';
import { useRowFilterSelection } from './RowFilterSelectionContext';
import { useActorIdentity } from './ActorIdentityContext';
import { useDebouncedValue } from './useDebouncedValue';
import type { FilterValues } from './filterValuesStore';
import { createPrScopeSelectionHelpers } from '../helpers/pr-scope-selection.helpers.ts';
import { createPrOpenConversationCountHelpers } from '../helpers/pr-open-conversation-count.helpers.ts';
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
import { countThreadsToCheck, threadConfirmationsFor } from '../helpers/pr-review-threads.helpers.ts';
import type { PrData, PrEntry } from '../types/pr-data.ts';

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
// useTableFilterChips.tsx debounces its display of it the same way;
// otherwise its chip would disagree with the (debounced) table while typing.
export const FILTER_PR_NUMBERS_DEBOUNCE_MS = 150;
// The search box waits the same, for the same reasons (and so the rows
// aren't all matched again on every keystroke).
export const FILTER_SEARCH_DEBOUNCE_MS = 150;

// Used when there's no <FilterStateProvider> ancestor at all (e.g.
// integration-tests/index.html.test.js's isolated PrTableApp mount, which
// deliberately never mounts one).
const DEFAULT_FILTER_STATE_VALUES: FilterValues = {
  onlyNeedsAttention: false,
  onlyOpenConversationsWithMe: false,
  onlyWaitingOnMe: false,
  onlyThreadsToCheck: false,
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
 * Composes the pure row-filtering helpers (narrowRows/
 * buildRowFilterCriteria/applyRowUiFilters/rowMatchesUiFilters), with the
 * actor-identity pieces (collectAssignedUsers/collectApproversFromRow/
 * getPreferredActorKey) from useActorIdentity() and attentionConfig/
 * entryNeedsAttention from useNeedsAttention().
 * Per-entry results are cached across renders (createEntryDerivedCache).
 *
 * `filterSearch` (the search box) is debounced the same way.
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
  const { attentionConfig, entryNeedsAttention } = useNeedsAttention();
  const { checkedByListId } = useRowFilterSelection();
  const { normalizeActorLogin, resolveActorDisplayName, getPreferredActorKey, getEffectiveViewerLogin } = useActorIdentity();
  const debouncedFilterPrNumbers = useDebouncedValue(values.filterPrNumbers, FILTER_PR_NUMBERS_DEBOUNCE_MS);
  const debouncedSearch = useDebouncedValue(values.filterSearch, FILTER_SEARCH_DEBOUNCE_MS);

  const cacheRef = useRef<EntryDerivedCache | null>(null);
  if (!cacheRef.current) {
    cacheRef.current = createEntryDerivedCache();
  }
  // Set just above and never replaced.
  const cache = cacheRef.current;

  const threadChecksByRepo = payload?.threadChecksByRepo;
  const actorsMap = payload?.actorsMap;
  const helpers = useMemo(() => {
    // The Review column's conversations: with a known viewer, those they
    // took part in (the speech bubble), and those waiting on them (filled).
    // Counted once per row for both checkboxes, until the rows or the
    // viewer lookup (which remakes these helpers) change.
    const { getOpenConversationCountWithMe } = createPrOpenConversationCountHelpers({ getEffectiveViewerLogin, asArray });
    const conversationCounts = new WeakMap<PrEntry, { count: number; waitingCount: number }>();
    const conversationsWithMe = (entry: PrEntry) => {
      let counts = conversationCounts.get(entry);
      if (!counts) {
        const conversations = getOpenConversationCountWithMe(entry?.data);
        counts = conversations.isViewerSpecific ? conversations : { count: 0, waitingCount: 0 };
        conversationCounts.set(entry, counts);
      }
      return counts;
    };
    const { narrowRows } = createPrScopeSelectionHelpers({
      entryNeedsAttention,
      isInReviewEnabled,
      entryHasOpenConversationsWithMe: (entry) => conversationsWithMe(entry).count > 0,
      entryHasConversationWaitingOnMe: (entry) => conversationsWithMe(entry).waitingCount > 0,
      entryHasThreadsToCheck: (entry) => {
        const pr = entry?.data || {};
        return (
          countThreadsToCheck(
            pr,
            String(getEffectiveViewerLogin(pr) || ''),
            getPreferredActorKey(pr?.authorLogin, pr?.author),
            threadConfirmationsFor(threadChecksByRepo, entry?.repo, entry?.prNumber),
          ) > 0
        );
      },
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
      // None for a PR without an author: not the resolver's "unknown",
      // which a search for "no" would find.
      getAuthorDisplayName: (row) =>
        row?.authorLogin || row?.author ? resolveActorDisplayName(row?.authorLogin, actorsMap || {}, row?.author) : '',
    });
    const { buildRowFilterCriteria, applyRowUiFilters } = createPrRowFilteringHelpers({
      rowMatchesUiFilters,
      getOrCompute: cache.getOrCompute,
      getOrComputeLatest: cache.getOrComputeLatest,
    });
    return createPrVisiblePrNumbersHelpers({
      narrowRows,
      buildRowFilterCriteria,
      applyRowUiFilters,
    });
  }, [
    cache,
    entryNeedsAttention,
    normalizeActorLogin,
    resolveActorDisplayName,
    getPreferredActorKey,
    getEffectiveViewerLogin,
    threadChecksByRepo,
    actorsMap,
  ]);

  return useMemo(
    () =>
      helpers.computeVisiblePrNumbers({
        payload,
        onlyNeedsAttention: Boolean(values.onlyNeedsAttention),
        onlyOpenConversationsWithMe: Boolean(values.onlyOpenConversationsWithMe),
        onlyWaitingOnMe: Boolean(values.onlyWaitingOnMe),
        onlyThreadsToCheck: Boolean(values.onlyThreadsToCheck),
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
        search: debouncedSearch,
      }),
    [helpers, payload, values, attentionConfig, checkedByListId, debouncedFilterPrNumbers, debouncedSearch],
  );
}

// PrTableApp's entry point: the visible rows' repo-and-number keys, and
// the search's words - each the same array while its contents are the
// same. The filtering runs again on every keystroke in a debounced field
// (it reads all the values), giving new arrays of the same keys; PrTableApp
// would rebuild and re-sort every section for them, and rows reading the
// words (SearchTermsContext) would all render again.
export function useVisiblePrKeys(): { visiblePrKeys: string[]; searchTerms: string[] } {
  const { visiblePrKeys, searchTerms } = useFilteredPrRows();
  const stableVisiblePrKeys = useSameArray(visiblePrKeys);
  const stableSearchTerms = useSameArray(searchTerms);
  return { visiblePrKeys: stableVisiblePrKeys, searchTerms: stableSearchTerms };
}

// The last array given while each one given has the same items in order.
function useSameArray<T>(items: T[]): T[] {
  const ref = useRef(items);
  const previous = ref.current;
  if (
    previous !== items &&
    (!Array.isArray(previous) || !Array.isArray(items) || previous.length !== items.length || items.some((item, index) => !Object.is(item, previous[index])))
  ) {
    ref.current = items;
  }
  return ref.current;
}
