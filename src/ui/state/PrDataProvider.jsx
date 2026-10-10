import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PrDataContext } from './PrDataContext';
import { ActorIdentityContext } from './ActorIdentityContext';
import { createPrActorIdentityHelpers } from '../helpers/pr-actor-identity.helpers.js';
import { createPrActorIdentityRenderHelpers } from '../helpers/pr-actor-identity-render.helpers.js';
import { createPrActorIdentityStyleHelpers } from '../helpers/pr-actor-identity-style.helpers.js';
import { createPrViewerContextHelpers } from '../helpers/pr-viewer-context.helpers.js';
import { inferViewerLoginFromPage } from '../helpers/pr-viewer-login-inference.helpers.js';

/**
 * Track C, slice C2c (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * owns the PR table's payload/selectedRepo/visiblePrNumbers as real React
 * state, replacing the "index.page.js calls window.updateReactPrTable,
 * which re-renders PrTableApp with fresh props via root.render()" pattern.
 *
 * Fixes a real latent bug found while designing this: PrTableApp used to
 * expose its own window.updateReactPrTable (a single-argument
 * `(newPayload) => setPayload(newPayload)`) via a useEffect that ran AFTER
 * mountReactPrTable's own multi-argument version was assigned, silently
 * clobbering it - so in the real running app, `selectedRepo`/
 * `visiblePrNumbers` updates from index.page.js's poll loop and
 * filter-apply pipeline were dropped after the initial mount; only
 * `payload` ever actually updated. Confirmed live (window.updateReactPrTable
 * .toString() showed the simplified single-arg version in production)
 * before this fix. Only react-app.test.jsx's isolated unit test (PrTableApp
 * mocked out, so its competing effect never ran) exercised the "real"
 * multi-argument merging logic - meaning it was tested but never actually
 * reachable end-to-end. This Provider is now the single place that assigns
 * window.updateReactPrTable, so there's no more competing assignment.
 *
 * `initialPayload`/`initialSelectedRepo`/`initialVisiblePrNumbers` seed the
 * state once at mount (mountReactPrTable, react-app.jsx) - all updates
 * after that go through window.updateReactPrTable (index.page.js's
 * updateReactTable, Track C slice C2b) or the exposed `setPayload` (used by
 * descendants like NotesSection.jsx's onDataRefresh, which applies a fresh
 * payload from its own direct POST /view-prs/notes response, bypassing the
 * vanilla bridge entirely).
 */
export function PrDataProvider({
  initialPayload,
  initialSelectedRepo,
  initialVisiblePrNumbers,
  initialSelectedAuthorLogin,
  initialStatsViewState,
  children,
}) {
  const [state, setState] = useState({
    payload: initialPayload || {},
    selectedRepo: initialSelectedRepo || '',
    // Phase 7 (see REACT_MIGRATION_PLAN.md, "live filtering"): this field
    // (and window.updateReactPrTable's 3rd argument below, which still
    // writes it) is now dead for the table specifically - PrTableApp reads
    // useVisiblePrNumbers() instead (state/useVisiblePrNumbers.jsx), a
    // reactive derivation that supersedes this imperatively-pushed value.
    // Left wired rather than ripped out this round: payload/selectedRepo
    // (the other 2 args) are still live, and removing the vanilla
    // computation that feeds this one (index.page.js's renderPrData) is
    // naturally scoped together with the runSinglePrUpdate/
    // recomputeDirtyPrSectionsFields follow-up this change unblocks, not
    // this slice.
    visiblePrNumbers: initialVisiblePrNumbers ?? null,
    selectedAuthorLogin: initialSelectedAuthorLogin || '',
    statsViewState: initialStatsViewState || {},
  });

  // Deferred-items follow-up, item 6 (see REACT_MIGRATION_PLAN.md): a read
  // bridge mirroring window.updateReactPrTable's write side, letting a
  // handful of index.page.js DI wirings prefer the same payload the visible
  // UI is currently showing over the raw, always-freshest vanilla
  // `latestStoredPayload` (see that item's own writeup for why this is the
  // more-correct choice for those specific consumers - it respects
  // pollForDataChanges' deliberate "don't disturb an in-progress edit"
  // deferral, which the raw vanilla variable doesn't). A ref, not `state`
  // captured directly, so the closure below (assigned once, via the `[]`
  // effect) always reads the latest payload rather than whatever `state`
  // was at mount time.
  const payloadRef = useRef(state.payload);
  payloadRef.current = state.payload;

  useEffect(() => {
    window.getReactPrTablePayload = () => payloadRef.current;
    return () => {
      delete window.getReactPrTablePayload;
    };
  }, []);

  // Sub-phase 7.2 follow-up (see REACT_MIGRATION_PLAN.md): a dedicated read
  // bridge for `selectedRepo` alone, mirroring getReactPrTablePayload above
  // (same ref-based reasoning - the `[]`-effect closure must always read
  // the latest value, not whatever `state` was at mount time). Kept
  // separate from getReactPrTablePayload rather than changing its return
  // shape, since existing callers (index.page.js) already depend on it
  // returning the payload directly.
  const selectedRepoRef = useRef(state.selectedRepo);
  selectedRepoRef.current = state.selectedRepo;

  useEffect(() => {
    window.getReactPrTableSelectedRepo = () => selectedRepoRef.current;
    return () => {
      delete window.getReactPrTableSelectedRepo;
    };
  }, []);

  useEffect(() => {
    window.updateReactPrTable = (newPayload, newSelectedRepo, newVisiblePrNumbers) => {
      setState((previous) => ({
        ...previous,
        payload: newPayload !== undefined ? newPayload : previous.payload,
        selectedRepo: newSelectedRepo || previous.selectedRepo,
        // undefined (param omitted) keeps the previous value; null/[] are
        // meaningful ("no filter" / "everything filtered out") and must
        // overwrite it - same semantics react-app.jsx's old updateTable
        // closure had. Phase 7 (see REACT_MIGRATION_PLAN.md, "live
        // filtering"): dead for the table now (see the state field's own
        // comment above) - still written here harmlessly in case anything
        // else reads it later, but PrTableApp no longer does.
        visiblePrNumbers: newVisiblePrNumbers !== undefined ? newVisiblePrNumbers : previous.visiblePrNumbers,
      }));
    };
    return () => {
      delete window.updateReactPrTable;
    };
  }, []);

  // Track C (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md): the
  // Author Insights tab's "which author is currently selected" value,
  // pushed from pr-author-insights.component.js's renderAuthorInsights on
  // every render (both explicit user picks and its own
  // auto-select-first-author fallback) - not from the selection handler
  // alone, since that fallback bypasses it. Read directly by
  // AuthorInsightsSelector/AuthorInsightsHeader/AuthorCreatedPrsSection/
  // AuthorInsightsNotesSection/AuthorInsightsCommentsSection.
  useEffect(() => {
    window.updateReactSelectedAuthorLogin = (login) => {
      setState((previous) => ({ ...previous, selectedAuthorLogin: login || '' }));
    };
    return () => {
      delete window.updateReactSelectedAuthorLogin;
    };
  }, []);

  const setPayload = useCallback((newPayload) => {
    setState((previous) => ({ ...previous, payload: newPayload }));
  }, []);

  // Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): the Review Stats
  // tab's sort/filter/topN/minComments/date-range settings - real state
  // now, written directly by ReviewStatsControls/StatsVisuals (see
  // components/ReviewStatsProvider.jsx), replacing
  // window.updateStatsViewStateAndRerender's mutate-vanilla-then-rerender
  // round trip (which also had the unrelated side effect of re-running the
  // PR table's whole local-filter pipeline on every stats-control change).
  const setStatsViewState = useCallback((patch) => {
    setState((previous) => ({ ...previous, statsViewState: { ...previous.statsViewState, ...patch } }));
  }, []);

  const value = { ...state, setPayload, setStatsViewState };

  // Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): derives the same
  // { currentActorLoginAliases, currentViewerLogin } index.page.js's own
  // deriveViewerFilterSetup computes, straight from the payload this
  // Provider already holds - no window.* bridge needed, since both sides
  // derive independently from the same source of truth instead of one
  // pushing a computed value to the other.
  const viewerContext = useMemo(() => {
    const { normalizeActorLoginAliases, normalizeActorLogin } = createPrActorIdentityHelpers();
    const { deriveViewerContext } = createPrViewerContextHelpers({
      normalizeActorLoginAliases,
      normalizeActorLogin,
      inferViewerLoginFromPage,
    });
    const allEntries = Object.values(state.payload?.byPrNumber || {});
    return deriveViewerContext({ payload: state.payload, allEntries });
  }, [state.payload]);

  const actorIdentity = useMemo(() => {
    const identityHelpers = createPrActorIdentityHelpers({
      getActorLoginAliases: () => viewerContext.currentActorLoginAliases,
    });
    const { getEffectiveViewerLogin } = createPrActorIdentityRenderHelpers({
      normalizeActorLogin: identityHelpers.normalizeActorLogin,
      getCurrentViewerLogin: () => viewerContext.currentViewerLogin,
    });
    return {
      ...identityHelpers,
      getEffectiveViewerLogin,
      ...createPrActorIdentityStyleHelpers(),
    };
  }, [viewerContext]);

  return (
    <PrDataContext.Provider value={value}>
      <ActorIdentityContext.Provider value={actorIdentity}>{children}</ActorIdentityContext.Provider>
    </PrDataContext.Provider>
  );
}
