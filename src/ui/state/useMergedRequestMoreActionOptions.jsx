import { useContext, useMemo } from 'react';
import { usePrData } from './PrDataContext';
import { FilterStateContext } from './FilterStateContext';
import { createPrScopeSelectionHelpers } from '../helpers/pr-scope-selection.helpers.ts';
import { createPrMergedRequestMoreConfigHelpers } from '../helpers/pr-merged-request-more-config.helpers.ts';

const { normalizeSelectedScope } = createPrScopeSelectionHelpers();
const { buildMergedRequestMoreActionOptions } = createPrMergedRequestMoreConfigHelpers();

// Same permissive "no <FilterStateProvider> ancestor" fallback
// useVisiblePrNumbers.jsx/useAppliedFilterSummary.jsx already use - only
// scopeMode is needed here, unlike those two, so this doesn't need their
// full DEFAULT_FILTER_STATE_VALUES shape.
const DEFAULT_SCOPE_MODE = 'all';

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering" follow-up): the
 * reactive replacement for the "Request more" merged-PRs button's
 * isVisible/repo props, previously pushed imperatively via
 * window.updateReactMergedRequestMoreAction (pr-render-apply.helpers.js's
 * applyRenderResults, run as a side effect of the vanilla render pipeline -
 * see that file's own comment) into AppRoot's local useState.
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
 * repoFilter/latestSelectedRepo both map to PrDataContext's own
 * `selectedRepo` - the vanilla pipeline's distinction between the two
 * (repoFilter = the render pipeline's own just-resolved repo,
 * latestSelectedRepo = the last repo applyResolvedRepo recorded) collapses
 * to the same single value once selectedRepo is the one, already-resolved,
 * reactive source of truth both sides shared on the vanilla side anyway.
 *
 * Forces isVisible to false until `payload.ok` confirms a real
 * /view-prs/data response has actually loaded. Found via code review:
 * PrDataProvider always mounts with initialPayload={} before the first
 * fetch resolves, and scopeMode's own real default is "all" - without this
 * guard, buildMergedRequestMoreActionOptions would report isVisible: true
 * (with repo: '') during that window, where the old window.*-bridge-fed
 * version stayed explicitly isVisible: false until the vanilla pipeline's
 * first real render. `ok: true` is a field every real server response sets
 * (buildDataPayload, view-prs-data-response-helpers.js) that the empty seed
 * never has.
 */
export function useMergedRequestMoreActionOptions() {
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
