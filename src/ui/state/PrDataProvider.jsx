import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PrDataContext } from './PrDataContext';
import { ActorIdentityContext } from './ActorIdentityContext';
import { createPrActorIdentityHelpers } from '../helpers/pr-actor-identity.helpers.js';
import { createPrActorIdentityRenderHelpers } from '../helpers/pr-actor-identity-render.helpers.ts';
import { createPrActorIdentityStyleHelpers } from '../helpers/pr-actor-identity-style.helpers.ts';
import { createPrViewerContextHelpers } from '../helpers/pr-viewer-context.helpers.ts';
import { inferViewerLoginFromPage } from '../helpers/pr-viewer-login-inference.helpers.ts';
import { createPrDataPollingOrchestrationHelpers } from '../helpers/pr-data-polling-orchestration.helpers.js';
import { createPrDataPollingHelpers } from '../helpers/pr-data-polling.helpers.js';
import { createEntryDerivedCache } from '../helpers/pr-entry-derived-cache.helpers.ts';
import { createPrStoredDataLoadHelpers } from '../helpers/pr-stored-data-load.helpers.ts';
import { createPrRepoRunContextHelpers } from '../helpers/pr-repo-run-context.helpers.ts';
import { buildFailureSnackbarNotification } from '../helpers/pr-failure-snackbar.helpers.ts';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';
import { useStatusText } from './StatusTextContext';
import { useSnackbar } from './SnackbarContext';
import { useSetOutputText } from './OutputTextContext';
import { useAutoRenderBlockingActions } from './AutoRenderBlockingContext';
import { useRequestActivity } from './RequestActivityContext';
import { PrDataActionsContext } from './PrDataActionsContext';
import { useBackfillStatusActions } from './BackfillStatusContext';
import { useFilterFieldActions } from './FilterStateContext';

// Phase F (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
// default state for pollForDataChanges' own render-tracking bookkeeping -
// matches index.page.js's old module-scope `let` defaults exactly.
// Phase H.25 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 1): lastSuccessfulPollCheckAt/lastPollErrorAt/hasActivePollWarning
// added - markPollSuccess/showPollFailureWarning's own former module `let`s
// (index.page.js), moved here since both functions exist only to serve
// this same trackingRef-owning poll loop.
const DEFAULT_POLLING_TRACKING_STATE = {
  supportsDataMetaPolling: true,
  supportsDataManifestPolling: true,
  lastSeenDataVersion: '',
  latestPrManifest: {},
  lastRenderedPrFingerprint: '',
  lastRenderedMetaFingerprint: '',
  lastRenderedRunStamp: '',
  lastSuccessfulPollCheckAt: '',
  lastPollErrorAt: '',
  hasActivePollWarning: false,
};

// Phase H.25 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 1): pure helper for showPollFailureWarning below - verbatim copy
// of index.page.js's own former describePollFailure, moved here since it
// has no other caller.
const describePollFailure = (errorSource) => {
  const messageCandidates =
    errorSource && typeof errorSource === 'object'
      ? [errorSource.error, errorSource.summary, errorSource.message, errorSource.stderr, errorSource.output]
      : [errorSource];

  const normalizedCandidates = messageCandidates.map((value) => String(value || '').trim()).filter(Boolean);

  return normalizedCandidates[0] || 'Polling request failed.';
};

const { formatIsoDatetime } = createPrFormattingHelpers();
const { deriveRepoRunContext } = createPrRepoRunContextHelpers();

// Window-bridge elimination Phase 7.3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// the request-activity bookkeeping that used to be defined here (labels,
// counters, badges) moved to components/RequestActivityProvider.jsx.

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
 * tested but never actually reachable end-to-end. This Provider became the
 * single place that assigned window.updateReactPrTable, so there was no more
 * competing assignment (the bridge itself is deleted now - see below).
 *
 * `initialPayload`/`initialSelectedRepo` seed the state once at mount
 * (mountAppRoot, react-app.jsx) - all updates after that go through this
 * Provider's own functions: its data pipeline (renderPrData/
 * applyFreshPrPayload), `applyFreshTablePayload`, or `setPayload` (used by
 * descendants like NotesSection.jsx's onDataRefresh, which applies a fresh
 * payload from its own direct POST /view-prs/notes response). They used to
 * also arrive through window.updateReactPrTable (index.page.js's
 * updateReactTable, Track C slice C2b), deleted once only tests used it.
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
 * re-render on every write. Its callers - `<PrDataPolling />`'s interval
 * and `JobEventsProvider.jsx`'s SSE "data changed" poll - read it from this
 * Provider's Context. (It was also published as `window.pollForDataChanges`
 * until window-bridge elimination Phase 7 deleted that bridge; the vanilla
 * writers of this tracking state, which went through
 * `window.pushPrDataPollingTrackingState`, moved into this Provider then
 * too - see the last paragraph.)
 *
 * Phase F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): also
 * built `beginRequestActivity`/`renderRequestActivity`/`pollBackfillStatus`.
 * Window-bridge elimination Phase 7.3 moved the first two (and their
 * counter/history/scheduler-state bookkeeping) out to
 * `components/RequestActivityProvider.jsx`, an ancestor, because two of their
 * callers sit above this Provider; this Provider now reads them from
 * `useRequestActivity()` like everyone else. `pollBackfillStatus` stays here
 * (`<PrDataPolling />` reads it from this Context); its load is
 * `BackfillStatusProvider`'s since Phase 7.2.
 *
 * Phase H.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * `pollSchedulerStatus` itself (this Provider's thin wrapper around
 * `window.loadSchedulerStatus`) is deleted outright - its own automatic
 * `setInterval` was already retired by the activity-drawer feature
 * (`PrDataPolling.jsx`'s own comment), and `index.html.test.js`'s one
 * remaining direct call was its only caller of any kind (confirmed:
 * `<PrDataPolling />` never destructured it from this Context either).
 * The real production behavior it exercised (the active-PR progress
 * indicator) is unaffected - `renderSchedulerStatus` is the one real
 * remaining path, called by `JobEventsProvider.jsx`'s SSE connection
 * (`RequestActivityProvider`'s, via Context, since window-bridge elimination
 * Phase 7.3; it was `index.page.js`'s `window.renderSchedulerStatus`).
 *
 * Phase H.24 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 1): the paragraph above's "`loadSchedulerStatus` stays vanilla -
 * reached via a reverse bridge" is now stale - `window.loadSchedulerStatus`
 * itself is deleted outright. `loadSchedulerStatus`'s implementation moved
 * to `helpers/pr-scheduler-status.helpers.ts`; `index.page.js` and
 * `useQuickCheckActions.jsx` (its only 2 real callers) each build their own
 * instance directly instead of going through this Provider or a `window.*`
 * bridge at all. `renderSchedulerStatus` itself (the one piece still
 * vanilla/SSE-shared, called by `JobEventsProvider.jsx` above) is
 * unaffected.
 *
 * Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * the paragraphs above that call `renderPrData`/`applyLatestPrData`/
 * `loadStoredData`/the fingerprint helpers "vanilla, reached via reverse
 * bridges" are history. That pipeline (and `applyFreshPrPayload`) now lives
 * in this Provider, published on `PrDataActionsContext`, and the initial
 * page-load fetch runs from this Provider's own mount effect (`loadOnMount`).
 * `window.pollForDataChanges`/`pushPrDataPollingTrackingState` are deleted.
 */
export function PrDataProvider({
  initialPayload,
  initialSelectedRepo,
  initialSelectedAuthorLogin,
  initialStatsViewState,
  loadOnMount = false,
  children,
}) {
  // hasRenderedPrData: false until the first payload is rendered (the initial
  // loadStoredData, or an earlier applyFreshPrPayload). AppRoot only mounts
  // the PR table after that, as index.page.js's renderPrData used to
  // (mountReactPrTable on the first render), so the table never flashes an
  // empty "no PRs" state before the data arrives.
  const [state, setState] = useState({
    payload: initialPayload || {},
    selectedRepo: initialSelectedRepo || '',
    selectedAuthorLogin: initialSelectedAuthorLogin || '',
    statsViewState: initialStatsViewState || {},
    hasRenderedPrData: false,
  });

  // Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // window.getReactPrTablePayload, getReactPrTableSelectedRepo,
  // updateReactPrTable and updateReactSelectedAuthorLogin are deleted. They
  // had no production caller; tests read and write the same state through
  // Context (usePrData()'s payload/selectedRepo/applyFreshTablePayload/
  // setSelectedAuthorLogin) via test-fixtures/pr-data-probe.jsx.

  // Phase F (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): see
  // this file's own header comment. A plain ref - nothing renders from
  // this state, it's pure diffing bookkeeping for pollForDataChanges.
  //
  // Seeded from initialPayload (same dataVersion/updatedAt extraction
  // pr-stored-data-load.helpers.ts's own loadStoredData uses), so a Provider
  // mounted with data already in hand (component tests) polls against it.
  // In the app the initial payload is empty and loadStoredData (below, owned
  // by this Provider since window-bridge elimination Phase 7) fills these in.
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
  // Phase H.8 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // setStatusMessage below writes statusText via useStatusText() directly
  // (this Provider is a genuine descendant of StatusTextProvider - see
  // react-app.jsx's mountAppRoot), composed with renderRequestActivity -
  // same reasoning as useRunScript.jsx's own comment on this exact
  // composition (renderRequestActivity is RequestActivityProvider's, read
  // below, since window-bridge elimination Phase 7.3).
  const { setStatusText } = useStatusText();
  // Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
  // markPollSuccess/showPollFailureWarning below call hide/showWarning
  // from useSnackbar() directly now, same "genuine descendant, wrapped
  // from outside AppRoot" reasoning as setStatusText above.
  const { showError, showWarning, hide } = useSnackbar();
  // Window-bridge elimination Phase 3: AutoRenderBlockingProvider wraps this
  // Provider from mountAppRoot() now (it used to be rendered *inside*
  // AppRoot, i.e. a descendant of this one), so these are real Context
  // reads instead of window.getHasDirtyPrSectionsFields/
  // getPendingAutoRenderPayload/setPendingAutoRenderPayload.
  // The actions-only Context, not useAutoRenderBlocking(): this Provider wraps
  // the whole table tree, so it must not re-render (and re-render every
  // usePrData() consumer) each time blocking *state* changes - see that
  // Context's own comment.
  const {
    getHasDirtyPrSectionsFields,
    getPendingAutoRenderPayload,
    setPendingAutoRenderPayload,
    setFreshPayloadApplier,
  } = useAutoRenderBlockingActions();
  // Window-bridge elimination Phase 4: pollBackfillStatus reads the backfill
  // tracking flags through BackfillStatusProvider's actions-only Context
  // (stable; subscribing to its changing status/log state would re-render
  // every usePrData() consumer on each backfill update).
  const { getBackfillTrackingState, updateBackfillStatusFromPayload, loadBackfillStatus } =
    useBackfillStatusActions();
  const setOutputText = useSetOutputText();
  // Window-bridge elimination Phase 7.3: RequestActivityProvider (an ancestor).
  const { beginRequestActivity, renderRequestActivity } = useRequestActivity();
  // Stable; reads the repo field without subscribing this Provider (and every
  // usePrData() consumer) to filter-field changes.
  const { getFieldValue } = useFilterFieldActions();

  // Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // the data pipeline index.page.js used to own and publish as
  // window.renderPrData/applyFreshPrPayload/applyLatestPrData/
  // getLatestStoredPayload/loadStoredData (plus the pure fingerprint/manifest
  // helpers, and window.pushPrDataPollingTrackingState for its writes into
  // trackingRef) lives here now. Same functions, same "who writes when";
  // only the owner changed.
  //
  // latestStoredPayloadRef/latestSelectedRepoRef are index.page.js's former
  // latestStoredPayload/latestSelectedRepo module variables. They are not
  // `state.payload`/`state.selectedRepo`: a background poll records the
  // newest payload here while auto-render-blocking defers showing it (see
  // pollForDataChanges), so this can be ahead of what the table displays.
  // Starts null, like the module variable did; an initialPayload with data
  // (component tests) seeds it.
  const latestStoredPayloadRef = useRef(
    initialPayload && Object.keys(initialPayload).length > 0 ? initialPayload : null,
  );
  const latestSelectedRepoRef = useRef(initialSelectedRepo || '');

  // One shared derived-value cache for this Provider's lifetime: it pays off
  // only by persisting across polls (an unchanged entry's fingerprint stays
  // cached from one poll to the next).
  const pollingHelpers = useMemo(
    () => createPrDataPollingHelpers({ getOrCompute: createEntryDerivedCache().getOrCompute }),
    [],
  );

  const applyLatestPrData = useCallback(({ payload, selectedRepo } = {}) => {
    if (payload !== undefined) {
      latestStoredPayloadRef.current = payload;
    }
    if (selectedRepo !== undefined) {
      latestSelectedRepoRef.current = selectedRepo;
    }
  }, []);

  const getLatestStoredPayload = useCallback(() => latestStoredPayloadRef.current, []);

  // The repo the render pipeline actually resolves: explicit repo, else the
  // Run & Filter "repo" field, else payload.lastRun.repo (see
  // deriveRepoRunContext). index.page.js read the field's DOM <input>; this
  // reads the same value from FilterStateProvider's store.
  const resolveRepoFilter = useCallback(
    (selectedRepo, payload) =>
      deriveRepoRunContext({
        selectedRepo,
        inputRepo: getFieldValue('repo'),
        lastRun: payload?.lastRun,
      }).repoFilter,
    [getFieldValue],
  );

  const recordRenderedPayload = useCallback(
    (payload) => {
      trackingRef.current = {
        ...trackingRef.current,
        lastRenderedPrFingerprint: pollingHelpers.computePrDataFingerprint(payload),
        lastRenderedMetaFingerprint: pollingHelpers.computePrDataMetaFingerprint(payload),
        latestPrManifest: pollingHelpers.computePrDataManifest(payload),
      };
    },
    [pollingHelpers],
  );

  // Puts a payload on screen. Same merge as applyFreshTablePayload (below):
  // an undefined payload or empty repo keeps the previous one.
  const showPayload = useCallback((payload, selectedRepo) => {
    setState((previous) => ({
      ...previous,
      payload: payload !== undefined ? payload : previous.payload,
      selectedRepo: selectedRepo || previous.selectedRepo,
      hasRenderedPrData: true,
    }));
  }, []);

  // index.page.js's renderPrData, minus what only the deleted vanilla
  // mount/update bridge needed. Renders the newest stored payload, which the
  // caller has normally just recorded. An empty resolved repo never
  // overwrites a known-good latestSelectedRepo.
  const renderPrData = useCallback(
    (payload, selectedRepo = '') => {
      if (payload) {
        latestStoredPayloadRef.current = payload;
        recordRenderedPayload(payload);
      }
      const resolvedRepo = resolveRepoFilter(selectedRepo, payload) || latestSelectedRepoRef.current || '';
      if (resolvedRepo) {
        latestSelectedRepoRef.current = resolvedRepo;
      }
      showPayload(latestStoredPayloadRef.current || payload || {}, resolvedRepo);
    },
    [recordRenderedPayload, resolveRepoFilter, showPayload],
  );

  // index.page.js's applyFreshPrPayload: for a caller that already has an
  // authoritative fresh payload in hand (a POST response, or a payload the
  // auto-render-blocking Provider was holding), so no refetch is needed.
  const applyFreshPrPayload = useCallback(
    (payload, repo) => {
      const resolvedRepo = repo || resolveRepoFilter(latestSelectedRepoRef.current, payload);
      latestStoredPayloadRef.current = payload;
      recordRenderedPayload(payload);
      // Same dataVersion/runStamp bookkeeping loadStoredData does with its own
      // GET response. POST /view-prs/run's prData has no dataMeta, so
      // lastSeenDataVersion isn't updated from that path; the next poll's
      // meta/manifest check finds the mismatch and fetches normally.
      const dataVersion = String(payload?.dataMeta?.dataVersion || '').trim();
      if (dataVersion) {
        trackingRef.current.lastSeenDataVersion = dataVersion;
      }
      const updatedAt = String(payload?.lastRun?.updatedAt || '').trim();
      if (updatedAt) {
        trackingRef.current.lastRenderedRunStamp = payload.lastRun.updatedAt;
      }
      setPendingAutoRenderPayload(null);
      updateBackfillStatusFromPayload(payload);
      if (resolvedRepo) {
        latestSelectedRepoRef.current = resolvedRepo;
      }
      showPayload(payload, resolvedRepo);
    },
    [recordRenderedPayload, resolveRepoFilter, setPendingAutoRenderPayload, showPayload, updateBackfillStatusFromPayload],
  );

  const pollForDataChanges = useMemo(() => {
    const helpers = createPrDataPollingOrchestrationHelpers({
      fetchFn: (...args) => fetch(...args),
      documentRef: typeof document !== 'undefined' ? document : null,
      computePrDataManifest: pollingHelpers.computePrDataManifest,
      getManifestDelta: pollingHelpers.getManifestDelta,
      mergeDataDeltaPayload: pollingHelpers.mergeDataDeltaPayload,
      computePrDataFingerprint: pollingHelpers.computePrDataFingerprint,
      computePrDataMetaFingerprint: pollingHelpers.computePrDataMetaFingerprint,
      getDataPollRenderAction: pollingHelpers.getDataPollRenderAction,
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
      // Deliberately the newest stored payload (latestStoredPayloadRef), not
      // the displayed one (state.payload): a deferred poll result must be the
      // base the next delta merges onto.
      getLatestStoredPayload,
      applyLatestPrData,
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
      // AutoRenderBlockingProvider.jsx, read via its Context (stable
      // functions - see AutoRenderBlockingContext.jsx).
      getHasDirtyPrSectionsFields,
      getPendingAutoRenderPayload,
      setPendingAutoRenderPayload,
      renderPrData,
      // Phase H.25 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
      // cluster 1): owned directly now, reading/writing trackingRef - no
      // window.* bridge needed at all, since pollForDataChanges (the only
      // real caller of either) already lives in this same Provider.
      // Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort
      // audit"): showWarningNotification/hideErrorNotification now call
      // showWarning/hide from useSnackbar() directly, not window.* bridges
      // - this Provider is a genuine descendant of SnackbarProvider too
      // (wrapped from outside AppRoot, same as StatusTextProvider).
      markPollSuccess: (checkedAt = new Date().toISOString()) => {
        trackingRef.current.lastSuccessfulPollCheckAt = String(checkedAt || '').trim();
        if (!trackingRef.current.hasActivePollWarning) {
          return;
        }
        hide();
        trackingRef.current.hasActivePollWarning = false;
      },
      showPollFailureWarning: ({ errorSource, attemptedAt } = {}) => {
        trackingRef.current.lastPollErrorAt = String(attemptedAt || new Date().toISOString()).trim();

        const lastSuccessLabel = trackingRef.current.lastSuccessfulPollCheckAt
          ? formatIsoDatetime(trackingRef.current.lastSuccessfulPollCheckAt)
          : 'Unavailable';
        const lastErrorLabel = formatIsoDatetime(trackingRef.current.lastPollErrorAt);

        showWarning(
          'Auto-refresh warning',
          [
            `Last successful check: ${lastSuccessLabel}`,
            `Last error at: ${lastErrorLabel}`,
            '',
            describePollFailure(errorSource),
          ].join('\n'),
          0,
        );

        trackingRef.current.hasActivePollWarning = true;
      },
      setStatusMessage: (message) => {
        setStatusText(message);
        renderRequestActivity();
      },
    });
    return helpers.pollForDataChanges;
  }, [
    pollingHelpers,
    getLatestStoredPayload,
    applyLatestPrData,
    renderPrData,
    setStatusText,
    renderRequestActivity,
    showWarning,
    hide,
    getHasDirtyPrSectionsFields,
    getPendingAutoRenderPayload,
    setPendingAutoRenderPayload,
  ]);

  // Window-bridge elimination Phase 7: window.pollForDataChanges and
  // window.pushPrDataPollingTrackingState are gone. Every caller of the first
  // reads it from this Context (PrDataPolling, JobEventsProvider); the second's
  // writers (index.page.js's renderPrData/applyFreshPrPayload/loadStoredData)
  // now live in this Provider and write trackingRef directly.

  // Window-bridge elimination Phase 7.3: request activity (beginRequestActivity/
  // renderRequestActivity, their bookkeeping, and the window.renderRequestActivity/
  // setLatestSchedulerStateAndRender bridges) moved out to RequestActivityProvider,
  // an ancestor - its callers include two of this Provider's ancestors. Only
  // the backfill poll stays here.
  //
  // pollBackfillStatus's guard flags (isBackfillRunning/
  // isBackfillActionPending) and the load itself are BackfillStatusProvider's,
  // read through its stable actions Context (this Provider's ancestor).
  // Window-bridge elimination Phase 7.2: the load used to be
  // index.page.js's instance, reached via window.loadBackfillStatus.
  const pollBackfillStatus = useCallback(async () => {
    const tracking = getBackfillTrackingState();
    if (!tracking.isBackfillRunning || tracking.isBackfillActionPending) {
      return;
    }
    try {
      await loadBackfillStatus({ announce: true, includeLog: true });
    } catch (_error) {
      // Ignore polling failures and wait for the next interval.
    }
  }, [getBackfillTrackingState, loadBackfillStatus]);

  // Window-bridge elimination Phase 7: index.page.js's loadStoredData instance
  // (same factory, same DI), now writing this Provider's refs directly.
  const loadStoredData = useMemo(() => {
    const helpers = createPrStoredDataLoadHelpers({
      fetch: (...args) => fetch(...args),
      beginRequestActivity,
      setLastSeenDataVersion: (value) => {
        trackingRef.current.lastSeenDataVersion = value;
      },
      setLastRenderedRunStamp: (value) => {
        trackingRef.current.lastRenderedRunStamp = value;
      },
      setLatestStoredPayload: (value) => applyLatestPrData({ payload: value }),
      getLatestSelectedRepo: () => latestSelectedRepoRef.current,
      setLatestSelectedRepo: (value) => applyLatestPrData({ selectedRepo: value }),
      updateBackfillStatusFromPayload,
      renderPrData,
    });
    return helpers.loadStoredData;
  }, [beginRequestActivity, applyLatestPrData, updateBackfillStatusFromPayload, renderPrData]);

  const prDataActions = useMemo(
    () => ({ loadStoredData, applyFreshPrPayload, applyLatestPrData, getLatestStoredPayload }),
    [loadStoredData, applyFreshPrPayload, applyLatestPrData, getLatestStoredPayload],
  );

  // AutoRenderBlockingProvider is this Provider's ancestor, so it can't read
  // this Context; it calls the applier registered here instead.
  useEffect(() => {
    setFreshPayloadApplier(applyFreshPrPayload);
    return () => setFreshPayloadApplier(null);
  }, [setFreshPayloadApplier, applyFreshPrPayload]);

  // The initial page-load fetch, which index.page.js's initPage used to make.
  // Opt-in (`loadOnMount`, set by mountAppRoot): the many component tests that
  // mount this Provider with their own initialPayload must not have it
  // replaced by whatever their fetch mock returns. Once per mount (the ref),
  // even though the error path's dependencies are listed for the linter.
  const hasStartedInitialLoadRef = useRef(false);
  useEffect(() => {
    if (!loadOnMount || hasStartedInitialLoadRef.current) {
      return;
    }
    hasStartedInitialLoadRef.current = true;
    loadStoredData('').catch((error) => {
      setStatusText('Failed to load stored data');
      renderRequestActivity();
      setOutputText(String(error));
      const { title, detail } = buildFailureSnackbarNotification(
        'Failed to load stored data',
        error,
        'Unable to load stored PR data',
      );
      showError(title, detail, 0);
    });
  }, [loadOnMount, loadStoredData, setStatusText, renderRequestActivity, setOutputText, showError]);

  const setPayload = useCallback((newPayload) => {
    setState((previous) => ({ ...previous, payload: newPayload }));
  }, []);

  // Phase H.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // same merge semantics the deleted window.updateReactPrTable had (newPayload
  // falls back to the previous payload if undefined, newSelectedRepo falls
  // back to the previous selectedRepo if falsy) - PrTableApp.jsx's own
  // per-row Ack/Apply-Label handlers need both fields updated together.
  // Using bare setPayload here would silently drop a selectedRepo change,
  // the same production bug this Provider's own header comment documents
  // for window.updateReactPrTable's single-field predecessor.
  const applyFreshTablePayload = useCallback((newPayload, newSelectedRepo) => {
    setState((previous) => ({
      ...previous,
      payload: newPayload !== undefined ? newPayload : previous.payload,
      selectedRepo: newSelectedRepo || previous.selectedRepo,
    }));
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

  // Phase G.1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // same write target the deleted window.updateReactSelectedAuthorLogin
  // used - exposed directly via Context, so
  // state/useNavigateToAuthorInsights.jsx can write the validated author
  // login without going through a window.* bridge for a React-to-React
  // call.
  const setSelectedAuthorLogin = useCallback((login) => {
    setState((previous) => ({ ...previous, selectedAuthorLogin: login || '' }));
  }, []);

  // Memoized: this Provider re-renders on every status message and
  // notification (it reads useStatusText()/useSnackbar(), whose values change
  // each time), and a value rebuilt on every render re-rendered every
  // usePrData() consumer - the whole PR table - with it. Every function here is
  // a stable useCallback/useMemo, so the value changes only with `state`.
  const value = useMemo(
    () => ({
      ...state,
      setPayload,
      applyFreshTablePayload,
      setStatsViewState,
      setSelectedAuthorLogin,
      pollForDataChanges,
      pollBackfillStatus,
    }),
    [
      state,
      setPayload,
      applyFreshTablePayload,
      setStatsViewState,
      setSelectedAuthorLogin,
      pollForDataChanges,
      pollBackfillStatus,
    ],
  );

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
      <PrDataActionsContext.Provider value={prDataActions}>
        <ActorIdentityContext.Provider value={actorIdentity}>{children}</ActorIdentityContext.Provider>
      </PrDataActionsContext.Provider>
    </PrDataContext.Provider>
  );
}
