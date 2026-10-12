import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PrDataContext } from './PrDataContext';
import { ActorIdentityContext } from './ActorIdentityContext';
import { createPrActorIdentityHelpers } from '../helpers/pr-actor-identity.helpers.js';
import { createPrActorIdentityRenderHelpers } from '../helpers/pr-actor-identity-render.helpers.js';
import { createPrActorIdentityStyleHelpers } from '../helpers/pr-actor-identity-style.helpers.js';
import { createPrViewerContextHelpers } from '../helpers/pr-viewer-context.helpers.js';
import { inferViewerLoginFromPage } from '../helpers/pr-viewer-login-inference.helpers.js';
import { createPrDataPollingOrchestrationHelpers } from '../helpers/pr-data-polling-orchestration.helpers.js';

// Phase F (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
// default state for pollForDataChanges' own render-tracking bookkeeping -
// matches index.page.js's old module-scope `let` defaults exactly.
const DEFAULT_POLLING_TRACKING_STATE = {
  supportsDataMetaPolling: true,
  supportsDataManifestPolling: true,
  lastSeenDataVersion: '',
  latestPrManifest: {},
  lastRenderedPrFingerprint: '',
  lastRenderedMetaFingerprint: '',
  lastRenderedRunStamp: '',
};

/**
 * Track C, slice C2c (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * owns the PR table's payload/selectedRepo as real React state, replacing
 * the "index.page.js calls window.updateReactPrTable, which re-renders
 * PrTableApp with fresh props via root.render()" pattern.
 *
 * Fixes a real latent bug found while designing this: PrTableApp used to
 * expose its own window.updateReactPrTable (a single-argument
 * `(newPayload) => setPayload(newPayload)`) via a useEffect that ran AFTER
 * mountReactPrTable's own multi-argument version was assigned, silently
 * clobbering it - so in the real running app, `selectedRepo` updates from
 * index.page.js's poll loop and filter-apply pipeline were dropped after
 * the initial mount; only `payload` ever actually updated. Confirmed live
 * (window.updateReactPrTable.toString() showed the simplified single-arg
 * version in production) before this fix. Only react-app.test.jsx's
 * isolated unit test (PrTableApp mocked out, so its competing effect never
 * ran) exercised the "real" multi-argument merging logic - meaning it was
 * tested but never actually reachable end-to-end. This Provider is now the
 * single place that assigns window.updateReactPrTable, so there's no more
 * competing assignment.
 *
 * `initialPayload`/`initialSelectedRepo` seed the state once at mount
 * (mountReactPrTable, react-app.jsx) - all updates after that go through
 * window.updateReactPrTable (index.page.js's updateReactTable, Track C
 * slice C2b) or the exposed `setPayload` (used by descendants like
 * NotesSection.jsx's onDataRefresh, which applies a fresh payload from its
 * own direct POST /view-prs/notes response, bypassing the vanilla bridge
 * entirely).
 *
 * Used to also own `visiblePrNumbers`, imperatively pushed by the vanilla
 * filter-apply pipeline - removed (see REACT_MIGRATION_PLAN.md, "live
 * filtering" follow-up and its later cleanup entry) once PrTableApp fully
 * switched to useVisiblePrNumbers() (state/useVisiblePrNumbers.jsx), a
 * reactive derivation with no dependency on this Provider's state, and the
 * vanilla computation that used to feed it (index.page.js's renderPrData)
 * was confirmed dead and deleted too.
 *
 * Phase F (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): also
 * builds `pollForDataChanges` itself now (still the same pure
 * `createPrDataPollingOrchestrationHelpers` factory index.page.js used to
 * wire up) and owns the render-tracking bookkeeping it depends on
 * (`trackingRef` below) - a plain ref, not `useState`: nothing ever
 * renders from this state, it exists purely for the poll's own
 * fingerprint/manifest-diffing, so there's no reason to trigger a
 * re-render on every write. Exposed to `<PrDataPolling />` directly via
 * this Provider's own Context value (no `window.*` indirection for that
 * call site - the actual Phase F goal), and *also* still as
 * `window.pollForDataChanges` (index.html.test.js calls it directly at 17
 * call sites and never mounts `<PrDataPolling />` - same "stays callable
 * for tests" precedent `window.pollSchedulerStatus` already established).
 * `applyFreshPrPayload`/`prDataTabOrchestrator`/`loadStoredData`
 * (index.page.js - 3 other vanilla call sites that write pieces of this
 * same tracking state directly) redirect through the new
 * `window.pushPrDataPollingTrackingState(partial)` bridge instead - same
 * "who writes when" structure, only the storage location moved, matching
 * the Phase E precedent of preserving trigger points while simplifying
 * mechanics. `renderPrData`/`markPollSuccess`/`showPollFailureWarning`/
 * `applyLatestPrData` and the pure fingerprint/manifest helpers stay
 * vanilla, reached via new reverse bridges (index.page.js) - same
 * category as every other "vanilla primitive exposed for React" bridge
 * in this migration.
 */
export function PrDataProvider({
  initialPayload,
  initialSelectedRepo,
  initialSelectedAuthorLogin,
  initialStatsViewState,
  children,
}) {
  const [state, setState] = useState({
    payload: initialPayload || {},
    selectedRepo: initialSelectedRepo || '',
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
    window.updateReactPrTable = (newPayload, newSelectedRepo) => {
      setState((previous) => ({
        ...previous,
        payload: newPayload !== undefined ? newPayload : previous.payload,
        selectedRepo: newSelectedRepo || previous.selectedRepo,
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

  // Phase F (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): see
  // this file's own header comment. A plain ref - nothing renders from
  // this state, it's pure diffing bookkeeping for pollForDataChanges.
  //
  // Seeded from initialPayload (same dataVersion/updatedAt extraction
  // pr-stored-data-load.helpers.js's own loadStoredData uses), not left
  // at the bare defaults: loadStoredData calls
  // setLastSeenDataVersion/setLastRenderedRunStamp (now
  // window.pushPrDataPollingTrackingState) *before* renderPrData, which
  // is what eventually mounts this very Provider - those calls always
  // race a bridge that doesn't exist yet on the very first load, so the
  // seed has to come from the payload this Provider already receives as
  // a prop instead. Confirmed via a real integration-test failure
  // ("skips full data fetch when polling sees an unchanged data
  // version") that this isn't just theoretical.
  const trackingRef = useRef({
    ...DEFAULT_POLLING_TRACKING_STATE,
    lastSeenDataVersion: String(initialPayload?.dataMeta?.dataVersion || '').trim(),
    lastRenderedRunStamp: String(initialPayload?.lastRun?.updatedAt || '').trim(),
  });

  // useMemo, not useEffect: every DI piece below is a stable bridge/ref
  // read, never changing across renders, so this only ever needs to run
  // once - but (unlike the bridge-install effect further down) the
  // resulting function must be available during render itself, to go
  // into this Provider's own Context `value` for <PrDataPolling /> to
  // call directly.
  const pollForDataChanges = useMemo(() => {
    const helpers = createPrDataPollingOrchestrationHelpers({
      fetchFn: (...args) => fetch(...args),
      documentRef: typeof document !== 'undefined' ? document : null,
      computePrDataManifest: (...args) => window.computePrDataManifest?.(...args),
      getManifestDelta: (...args) => window.getManifestDelta?.(...args),
      mergeDataDeltaPayload: (...args) => window.mergeDataDeltaPayload?.(...args),
      computePrDataFingerprint: (...args) => window.computePrDataFingerprint?.(...args),
      computePrDataMetaFingerprint: (...args) => window.computePrDataMetaFingerprint?.(...args),
      getDataPollRenderAction: (...args) => window.getDataPollRenderAction?.(...args),
      getSupportsDataMetaPolling: () => trackingRef.current.supportsDataMetaPolling,
      setSupportsDataMetaPolling: (value) => {
        trackingRef.current.supportsDataMetaPolling = value;
      },
      getSupportsDataManifestPolling: () => trackingRef.current.supportsDataManifestPolling,
      setSupportsDataManifestPolling: (value) => {
        trackingRef.current.supportsDataManifestPolling = value;
      },
      getLastSeenDataVersion: () => trackingRef.current.lastSeenDataVersion,
      setLastSeenDataVersion: (value) => {
        trackingRef.current.lastSeenDataVersion = value;
      },
      getLatestPrManifest: () => trackingRef.current.latestPrManifest,
      setLatestPrManifest: (value) => {
        trackingRef.current.latestPrManifest = value;
      },
      // Deliberately the vanilla mirror (window.getLatestStoredPayload,
      // index.page.js's own latestStoredPayload), not this Provider's own
      // payloadRef - matches pollForDataChanges' original DI exactly (see
      // index.page.js's old comment, preserved in git history).
      getLatestStoredPayload: () => window.getLatestStoredPayload?.(),
      applyLatestPrData: (...args) => window.applyLatestPrData?.(...args),
      getLastRenderedPrFingerprint: () => trackingRef.current.lastRenderedPrFingerprint,
      setLastRenderedPrFingerprint: (value) => {
        trackingRef.current.lastRenderedPrFingerprint = value;
      },
      getLastRenderedMetaFingerprint: () => trackingRef.current.lastRenderedMetaFingerprint,
      setLastRenderedMetaFingerprint: (value) => {
        trackingRef.current.lastRenderedMetaFingerprint = value;
      },
      getLastRenderedRunStamp: () => trackingRef.current.lastRenderedRunStamp,
      setLastRenderedRunStamp: (value) => {
        trackingRef.current.lastRenderedRunStamp = value;
      },
      // Phase B (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
      // pendingAutoRenderPayload/hasDirtyPrSectionsFields live in
      // AutoRenderBlockingProvider.jsx - unchanged, still reached the same
      // way index.page.js's own pollForDataChanges wiring used to.
      getHasDirtyPrSectionsFields: () => window.getHasDirtyPrSectionsFields?.() ?? false,
      getPendingAutoRenderPayload: () => window.getPendingAutoRenderPayload?.() ?? null,
      setPendingAutoRenderPayload: (value) => {
        window.setPendingAutoRenderPayload?.(value);
      },
      renderPrData: (...args) => window.renderPrData?.(...args),
      markPollSuccess: (...args) => window.markPollSuccess?.(...args),
      showPollFailureWarning: (...args) => window.showPollFailureWarning?.(...args),
      setStatusMessage: (...args) => window.setStatusMessage?.(...args),
    });
    return helpers.pollForDataChanges;
  }, []);

  useEffect(() => {
    window.pollForDataChanges = (...args) => pollForDataChanges(...args);
    window.pushPrDataPollingTrackingState = (partial) => {
      trackingRef.current = { ...trackingRef.current, ...(partial || {}) };
    };
    return () => {
      delete window.pollForDataChanges;
      delete window.pushPrDataPollingTrackingState;
    };
  }, [pollForDataChanges]);

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

  const value = { ...state, setPayload, setStatsViewState, pollForDataChanges };

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
