import { useContext, useMemo } from 'react';
import { usePrData } from './PrDataContext';
import { FilterStateContext } from './FilterStateContext';
import { createPrScopeSelectionHelpers } from '../helpers/pr-scope-selection.helpers.ts';
import {
  createPrMergedRequestMoreConfigHelpers,
  type MergedRequestMoreActionOptions,
} from '../helpers/pr-merged-request-more-config.helpers.ts';

const { normalizeSelectedScope } = createPrScopeSelectionHelpers();
const { buildMergedRequestMoreActionOptions } = createPrMergedRequestMoreConfigHelpers();

// Same permissive "no <FilterStateProvider> ancestor" fallback
// useVisiblePrNumbers.jsx/useAppliedFilterSummary.tsx already use - only
// scopeMode is needed here, unlike those two, so this doesn't need their
// full DEFAULT_FILTER_STATE_VALUES shape.
const DEFAULT_SCOPE_MODE = 'all';

/**
 * The "Request more" merged-PRs button's visibility and repo, derived from
 * the scope mode and PrDataContext's payload/selectedRepo.
 *
 * Deliberately does NOT reuse useFilteredPrRows() (state/useVisiblePrNumbers.
 * jsx) for `selectedScope` even though that hook already derives it
 * internally - that hook also pulls in useNeedsAttention()/
 * useRowFilterSelection()/useActorIdentity() and runs the full row-filtering
 * pipeline, none of which this needs (selectedScope is a pure function of
 * scopeMode alone - see pr-scope-selection.helpers.ts's normalizeSelectedScope,
 * which ignores its own entryNeedsAttention/entryHasYourLastActivity DI
 * params entirely). Reusing it here would mean this button's visibility
 * silently depends on the full filtering pipeline's own perf/Context
 * footprint for no reason.
 *
 * repoFilter/latestSelectedRepo are both PrDataContext's `selectedRepo`
 * (the helper predates the two being one value).
 *
 * Forces isVisible to false until `payload.ok` confirms a real
 * /view-prs/data response has actually loaded. Found via code review:
 * PrDataProvider always mounts with initialPayload={} before the first
 * fetch resolves, and scopeMode's own real default is "all" - without this
 * guard, buildMergedRequestMoreActionOptions would report isVisible: true
 * (with repo: '') during that window. `ok: true` is a field every real server response sets
 * (buildDataPayload, view-prs-data-response-helpers.js) that the empty seed
 * never has.
 */
export function useMergedRequestMoreActionOptions(): MergedRequestMoreActionOptions {
  const { payload, selectedRepo } = usePrData();
  const filterState = useContext(FilterStateContext);
  const scopeMode = filterState?.values?.scopeMode ?? DEFAULT_SCOPE_MODE;

  return useMemo(() => {
    const options = buildMergedRequestMoreActionOptions({
      selectedScope: normalizeSelectedScope(scopeMode),
      repoFilter: selectedRepo,
      lastRunRepo: payload?.lastRun?.repo || '',
      latestSelectedRepo: selectedRepo,
    });
    return payload?.ok ? options : { ...options, isVisible: false };
  }, [scopeMode, selectedRepo, payload]);
}
