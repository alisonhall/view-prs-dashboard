import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PrDataContext,
  type PrDataState,
  type PrDataValue,
  type ReviewStatsViewState,
} from './PrDataContext';
import { ActorIdentityContext, type ActorIdentityValue } from './ActorIdentityContext';
import { createPrActorIdentityHelpers } from '../helpers/pr-actor-identity.helpers.ts';
import { createPrActorIdentityRenderHelpers } from '../helpers/pr-actor-identity-render.helpers.ts';
import { createPrActorIdentityStyleHelpers } from '../helpers/pr-actor-identity-style.helpers.ts';
import { createPrViewerContextHelpers } from '../helpers/pr-viewer-context.helpers.ts';
import { inferViewerLoginFromPage } from '../helpers/pr-viewer-login-inference.helpers.ts';
import { createPrDataPollingOrchestrationHelpers } from '../helpers/pr-data-polling-orchestration.helpers.ts';
import { createPrDataPollingHelpers } from '../helpers/pr-data-polling.helpers.ts';
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
import { PrDataActionsContext, type PrDataActionsValue } from './PrDataActionsContext';
import { useBackfillStatusActions } from './BackfillStatusContext';
import { useFilterFieldActions } from './FilterStateContext';
import type { PrDataPayload, PrManifest } from '../types/pr-data.ts';

// pollForDataChanges' bookkeeping (see trackingRef below): which polling
// endpoints the server supports, what was last seen and rendered, and the
// poll-failure warning's state.
interface PollingTrackingState {
  supportsDataMetaPolling: boolean;
  supportsDataManifestPolling: boolean;
  lastSeenDataVersion: string;
  latestPrManifest: PrManifest;
  lastRenderedPrFingerprint: string;
  lastRenderedMetaFingerprint: string;
  lastRenderedRunStamp: string;
  lastSuccessfulPollCheckAt: string;
  lastPollErrorAt: string;
  hasActivePollWarning: boolean;
}

const DEFAULT_POLLING_TRACKING_STATE: PollingTrackingState = {
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

// The first message a failed poll's error carries, for the warning below.
const describePollFailure = (errorSource: unknown): string => {
  const source = errorSource as Record<string, unknown> | null;
  const messageCandidates =
    source && typeof source === 'object'
      ? [source.error, source.summary, source.message, source.stderr, source.output]
      : [errorSource];

  const normalizedCandidates = messageCandidates.map((value) => String(value || '').trim()).filter(Boolean);

  return normalizedCandidates[0] || 'Polling request failed.';
};

const { formatIsoDatetime } = createPrFormattingHelpers();
const { deriveRepoRunContext } = createPrRepoRunContextHelpers();

/**
 * Owns the PR table's data as React state (see PrDataContext.tsx): the
 * payload, its repo, the Review Stats view settings, the selected Author
 * Insights author, and whether a payload has been rendered yet. It also
 * provides PrDataActionsContext (the data pipeline) and
 * ActorIdentityContext (derived from the payload). It publishes no window
 * bridges; tests read and write this state through the Contexts
 * (test-fixtures/pr-data-probe.jsx).
 *
 * `initialPayload`/`initialSelectedRepo`/... seed the state once at mount
 * (mountAppRoot, react-app.jsx). After that, updates go through this
 * Provider's functions: the data pipeline (renderPrData/
 * applyFreshPrPayload, used by loadStoredData and the polls),
 * `applyFreshTablePayload` (payload and repo together), or `setPayload`
 * (e.g. NotesSection.jsx applying its POST /view-prs/notes response).
 *
 * `pollForDataChanges` (called by <PrDataPolling />'s interval and
 * JobEventsProvider's SSE "data changed" events) and `pollBackfillStatus`
 * are built here; the poll's bookkeeping is a ref (`trackingRef`), since
 * nothing renders from it. Request activity and the backfill load come
 * from RequestActivityProvider and BackfillStatusProvider (ancestors).
 *
 * `loadOnMount` (set by mountAppRoot) runs the initial page-load fetch.
 */
export function PrDataProvider({
  initialPayload,
  initialSelectedRepo,
  initialSelectedAuthorLogin,
  initialStatsViewState,
  loadOnMount = false,
  children,
}: {
  initialPayload?: PrDataPayload;
  initialSelectedRepo?: string;
  initialSelectedAuthorLogin?: string;
  initialStatsViewState?: ReviewStatsViewState;
  loadOnMount?: boolean;
  children?: ReactNode;
}) {
  // hasRenderedPrData: false until the first payload is rendered (the initial
  // loadStoredData, or an earlier applyFreshPrPayload). AppRoot only mounts
  // the PR table after that, so the table never flashes an empty "no PRs"
  // state before the data arrives.
  const [state, setState] = useState<PrDataState>({
    payload: initialPayload || {},
    selectedRepo: initialSelectedRepo || '',
    selectedAuthorLogin: initialSelectedAuthorLogin || '',
    statsViewState: initialStatsViewState || {},
    hasRenderedPrData: false,
  });

  // pollForDataChanges' bookkeeping. A plain ref - nothing renders from it.
  //
  // Seeded from initialPayload (the same dataVersion/updatedAt extraction
  // pr-stored-data-load.helpers.ts's loadStoredData uses), so a Provider
  // mounted with data already in hand (component tests) polls against it.
  // In the app the initial payload is empty and loadStoredData fills these.
  const trackingRef = useRef<PollingTrackingState>({
    ...DEFAULT_POLLING_TRACKING_STATE,
    lastSeenDataVersion: String(initialPayload?.dataMeta?.dataVersion || '').trim(),
    lastRenderedRunStamp: String(initialPayload?.lastRun?.updatedAt || '').trim(),
  });

  const { setStatusText } = useStatusText();
  const { showError, showWarning, hide } = useSnackbar();
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
  // The actions-only Context, for the same reason: subscribing to its
  // changing status/log state would re-render every usePrData() consumer on
  // each backfill update.
  const { getBackfillTrackingState, updateBackfillStatusFromPayload, loadBackfillStatus } =
    useBackfillStatusActions();
  const setOutputText = useSetOutputText();
  const { beginRequestActivity, renderRequestActivity } = useRequestActivity();
  // Stable; reads the repo field without subscribing this Provider (and every
  // usePrData() consumer) to filter-field changes.
  const { getFieldValue } = useFilterFieldActions();

  // The newest stored payload and its repo. Not `state.payload`/
  // `state.selectedRepo`: a background poll records the newest payload here
  // while auto-render-blocking defers showing it (see pollForDataChanges),
  // so this can be ahead of what the table displays. Starts null; an
  // initialPayload with data (component tests) seeds it.
  const latestStoredPayloadRef = useRef<PrDataPayload | null>(
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

  const applyLatestPrData = useCallback<PrDataActionsValue['applyLatestPrData']>(({ payload, selectedRepo } = {}) => {
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
  // deriveRepoRunContext), read from FilterStateProvider's store.
  const resolveRepoFilter = useCallback(
    (selectedRepo: string, payload: PrDataPayload | null | undefined) =>
      deriveRepoRunContext({
        selectedRepo,
        inputRepo: String(getFieldValue('repo') ?? ''),
        lastRun: payload?.lastRun,
      }).repoFilter,
    [getFieldValue],
  );

  const recordRenderedPayload = useCallback(
    (payload: PrDataPayload) => {
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
  const showPayload = useCallback((payload: PrDataPayload | undefined, selectedRepo: string) => {
    setState((previous) => ({
      ...previous,
      payload: payload !== undefined ? payload : previous.payload,
      selectedRepo: selectedRepo || previous.selectedRepo,
      hasRenderedPrData: true,
    }));
  }, []);

  // Renders the newest stored payload, which the caller has normally just
  // recorded. An empty resolved repo never
  // overwrites a known-good latestSelectedRepo.
  const renderPrData = useCallback(
    (payload: PrDataPayload | null | undefined, selectedRepo: string = '') => {
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

  // For a caller that already has an
  // authoritative fresh payload in hand (a POST response, or a payload the
  // auto-render-blocking Provider was holding), so no refetch is needed.
  const applyFreshPrPayload = useCallback<PrDataActionsValue['applyFreshPrPayload']>(
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
        trackingRef.current.lastRenderedRunStamp = payload.lastRun?.updatedAt ?? '';
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
      fetchFn: (input, init) => fetch(input, init),
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
      // AutoRenderBlockingProvider's (stable functions - see
      // AutoRenderBlockingContext.tsx).
      getHasDirtyPrSectionsFields,
      getPendingAutoRenderPayload,
      setPendingAutoRenderPayload,
      renderPrData,
      markPollSuccess: (checkedAt = new Date().toISOString()) => {
        trackingRef.current.lastSuccessfulPollCheckAt = String(checkedAt || '').trim();
        if (!trackingRef.current.hasActivePollWarning) {
          return;
        }
        hide();
        trackingRef.current.hasActivePollWarning = false;
      },
      showPollFailureWarning: ({ errorSource, attemptedAt }) => {
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

  // Skipped unless a backfill is running and no backfill action is pending
  // (BackfillStatusProvider's flags).
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

  const loadStoredData = useMemo(() => {
    const helpers = createPrStoredDataLoadHelpers({
      fetch: (input) => fetch(input),
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

  const prDataActions = useMemo<PrDataActionsValue>(
    () => ({ loadStoredData, applyFreshPrPayload, applyLatestPrData, getLatestStoredPayload }),
    [loadStoredData, applyFreshPrPayload, applyLatestPrData, getLatestStoredPayload],
  );

  // AutoRenderBlockingProvider is this Provider's ancestor, so it can't read
  // this Context; it calls the applier registered here instead.
  useEffect(() => {
    setFreshPayloadApplier(applyFreshPrPayload);
    return () => setFreshPayloadApplier(null);
  }, [setFreshPayloadApplier, applyFreshPrPayload]);

  // The initial page-load fetch. Opt-in (`loadOnMount`, set by mountAppRoot): the many component tests that
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

  const setPayload = useCallback<PrDataValue['setPayload']>((newPayload) => {
    setState((previous) => ({ ...previous, payload: newPayload }));
  }, []);

  // newPayload falls back to the previous payload if undefined,
  // newSelectedRepo to the previous selectedRepo if falsy. PrTableApp.jsx's
  // per-row Ack/Apply-Label handlers need both fields updated together;
  // bare setPayload would drop a selectedRepo change.
  const applyFreshTablePayload = useCallback<PrDataValue['applyFreshTablePayload']>((newPayload, newSelectedRepo) => {
    setState((previous) => ({
      ...previous,
      payload: newPayload !== undefined ? newPayload : previous.payload,
      selectedRepo: newSelectedRepo || previous.selectedRepo,
    }));
  }, []);

  // The Review Stats tab's sort/filter/topN/minComments/date-range settings,
  // written by ReviewStatsControls/StatsVisuals (see
  // components/ReviewStatsProvider.tsx).
  const setStatsViewState = useCallback<PrDataValue['setStatsViewState']>((patch) => {
    setState((previous) => ({ ...previous, statsViewState: { ...previous.statsViewState, ...patch } }));
  }, []);

  // Written by state/useNavigateToAuthorInsights.jsx with a validated login.
  const setSelectedAuthorLogin = useCallback<PrDataValue['setSelectedAuthorLogin']>((login) => {
    setState((previous) => ({ ...previous, selectedAuthorLogin: login || '' }));
  }, []);

  // Memoized: this Provider re-renders on every status message and
  // notification (it reads useStatusText()/useSnackbar(), whose values change
  // each time), and a value rebuilt on every render re-rendered every
  // usePrData() consumer - the whole PR table - with it. Every function here is
  // a stable useCallback/useMemo, so the value changes only with `state`.
  const value = useMemo<PrDataValue>(
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

  // The viewer's login aliases and login, derived from the payload; the
  // actor identity functions below are built from them.
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

  const actorIdentity = useMemo<ActorIdentityValue>(() => {
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
