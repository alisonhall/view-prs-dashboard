import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PrDataContext } from './PrDataContext';
import { ActorIdentityContext } from './ActorIdentityContext';
import { createPrActorIdentityHelpers } from '../helpers/pr-actor-identity.helpers.js';
import { createPrActorIdentityRenderHelpers } from '../helpers/pr-actor-identity-render.helpers.js';
import { createPrActorIdentityStyleHelpers } from '../helpers/pr-actor-identity-style.helpers.js';
import { createPrViewerContextHelpers } from '../helpers/pr-viewer-context.helpers.js';
import { inferViewerLoginFromPage } from '../helpers/pr-viewer-login-inference.helpers.js';
import { createPrDataPollingOrchestrationHelpers } from '../helpers/pr-data-polling-orchestration.helpers.js';
import { createPrActivityBadgesHelpers } from '../helpers/pr-activity-badges.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { useStatusText } from './StatusTextContext';
import { useSnackbar } from './SnackbarContext';

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

// Phase F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
// default state for the request-activity-counter/history/scheduler-state
// bookkeeping below - matches index.page.js's old module-scope
// requestActivityCounters/requestActivityStartedAtMs/
// recentRequestActivityEntries/latestSchedulerState defaults exactly.
const REQUEST_ACTIVITY_LABELS = {
  runScript: 'Run script',
  ackClear: 'Ack/Clear',
  singlePr: 'Single PR update',
  dataLoad: 'Data refresh',
  backfill: 'Backfill request',
  labelApply: 'Apply label',
  checkboxToggle: 'Checkbox toggle',
  notesSave: 'Notes save',
  authorComment: 'Author comment',
};
const DEFAULT_REQUEST_ACTIVITY_STATE = {
  counters: Object.fromEntries(Object.keys(REQUEST_ACTIVITY_LABELS).map((key) => [key, 0])),
  startedAtMs: Object.fromEntries(Object.keys(REQUEST_ACTIVITY_LABELS).map((key) => [key, 0])),
  recentEntries: [],
  latestSchedulerState: {},
};
const RECENT_REQUEST_ACTIVITY_LIMIT = 10;
const REQUEST_ACTIVITY_WARN_MS = 2 * 60 * 1000;
const REQUEST_ACTIVITY_CRITICAL_MS = 6 * 60 * 1000;

const formatElapsedLabel = (elapsedMs) => {
  const totalSeconds = Math.max(
    0,
    Math.floor(Number.isFinite(Number(elapsedMs)) ? Number(elapsedMs) / 1000 : 0),
  );
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
};

const getElapsedFromStartMs = (startMs) => {
  const parsedStart = Number(startMs || 0);
  if (!Number.isFinite(parsedStart) || parsedStart <= 0) {
    return null;
  }
  return Math.max(0, Date.now() - parsedStart);
};

const withElapsedSuffix = (label, elapsedMs) => {
  if (!Number.isFinite(Number(elapsedMs)) || Number(elapsedMs) < 0) {
    return label;
  }
  return `${label} (${formatElapsedLabel(elapsedMs)})`;
};

const getRequestActivitySeverityClass = (elapsedMs) => {
  const safeElapsedMs = Number(elapsedMs);
  if (!Number.isFinite(safeElapsedMs) || safeElapsedMs < 0) {
    return '';
  }
  if (safeElapsedMs >= REQUEST_ACTIVITY_CRITICAL_MS) {
    return 'scheduler-badge-critical';
  }
  if (safeElapsedMs >= REQUEST_ACTIVITY_WARN_MS) {
    return 'scheduler-badge-warning';
  }
  return '';
};

// Built once, not per-render - same "stable, zero-per-render-state"
// precedent as useSinglePrUpdate.jsx's own module-level instantiation.
const { getRequestActivityBadges } = createPrActivityBadgesHelpers({
  withElapsedSuffix,
  getRequestActivitySeverityClass,
});

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
 * `window.pollForDataChanges` - unlike `window.pollSchedulerStatus`
 * (retired outright in Phase H.2, see REACT_MIGRATION_PLAN.md, once its
 * automatic trigger was long dead), this bridge has a genuine, live
 * production caller: `JobEventsProvider.jsx`'s real SSE connection calls
 * it directly for an immediate out-of-band poll on a "data changed"
 * event, outside the interval. Phase H.3 (see REACT_MIGRATION_PLAN.md)
 * converted `index.html.test.js`'s 9 tests to drive polls through a real
 * `<PrDataPolling />` interval (fake timers) instead of calling this
 * bridge directly, but the bridge itself stays - it's not test-only.
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
 *
 * Phase F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): also
 * builds `beginRequestActivity`/`renderRequestActivity`/`pollBackfillStatus`
 * now (inlined directly - unlike `pollForDataChanges`, there was no
 * pre-existing pure DI-factory to wrap), owning the counter/history/
 * scheduler-state bookkeeping they depend on (`activityRef` below) - same
 * plain-ref reasoning as `trackingRef`. `beginRequestActivity` stays
 * bridged as `window.beginRequestActivity` (5 real React consumers -
 * `useSinglePrUpdate.jsx`/`useRunScript.jsx`/`useBackfillActions.jsx`/
 * `useAckLabelActions.jsx`/`NotesSection.jsx` - already read it that way,
 * by design, same precedent as `applyFreshPrPayload`).
 * `window.pollBackfillStatus`/`window.renderRequestActivity` had no
 * caller left besides `<PrDataPolling />` once it reads them from Context
 * instead - both deleted outright from `index.page.js`, not kept.
 * `index.page.js`'s own `beginRequestActivity`/`renderRequestActivity`
 * consts become thin proxies to these same bridges, so their 9+ existing
 * vanilla call sites keep working unchanged. `renderSchedulerStatus`
 * (index.page.js, still vanilla) pushes into `activityRef` via a new
 * `window.setLatestSchedulerStateAndRender(scheduler)` bridge instead of
 * writing a bare module `let`. `loadBackfillStatus`/`loadSchedulerStatus`
 * stay vanilla (other real callers beyond polling) - reached via 2 more new
 * reverse bridges, same category as everything else in this paragraph.
 *
 * Phase H.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
 * `pollSchedulerStatus` itself (this Provider's thin wrapper around
 * `window.loadSchedulerStatus`) is deleted outright - its own automatic
 * `setInterval` was already retired by the activity-drawer feature
 * (`PrDataPolling.jsx`'s own comment), and `index.html.test.js`'s one
 * remaining direct call was its only caller of any kind (confirmed:
 * `<PrDataPolling />` never destructured it from this Context either).
 * The real production behavior it exercised (the active-PR progress
 * indicator) is unaffected - `window.renderSchedulerStatus`
 * (`index.page.js`, still vanilla) is the one real remaining path,
 * called directly by `JobEventsProvider.jsx`'s SSE connection.
 *
 * Phase H.24 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 1): the paragraph above's "`loadSchedulerStatus` stays vanilla -
 * reached via a reverse bridge" is now stale - `window.loadSchedulerStatus`
 * itself is deleted outright. `loadSchedulerStatus`'s implementation moved
 * to `helpers/pr-scheduler-status.helpers.js`; `index.page.js` and
 * `useQuickCheckActions.jsx` (its only 2 real callers) each build their own
 * instance directly instead of going through this Provider or a `window.*`
 * bridge at all. `renderSchedulerStatus` itself (the one piece still
 * vanilla/SSE-shared, called by `JobEventsProvider.jsx` above) is
 * unaffected.
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
  // Author Insights tab's "which author is currently selected" value.
  // Read directly by AuthorInsightsSelector/AuthorInsightsHeader/
  // AuthorCreatedPrsSection/AuthorInsightsNotesSection/
  // AuthorInsightsCommentsSection.
  //
  // Phase H.17 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 2): this bridge used to be the only write path, pushed from
  // pr-author-insights.component.js's renderAuthorInsights on every
  // render (both explicit user picks and its own
  // auto-select-first-author fallback) - that component is deleted
  // outright now. AuthorInsightsSelector.jsx owns both explicit picks and
  // the fallback itself, writing setSelectedAuthorLogin (below) directly
  // - this bridge has no remaining production caller, kept only as a
  // test-utility "simulate an external Context write" shortcut (several
  // test files still use it that way).
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
  // Phase H.8 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // setStatusMessage below writes statusText via useStatusText() directly
  // (this Provider is a genuine descendant of StatusTextProvider - see
  // react-app.jsx's mountAppRoot), composed with window.renderRequestActivity
  // - same reasoning as useRunScript.jsx's own comment on this exact
  // composition (renderRequestActivity itself stays bridged - it's this
  // same component's own activityHelpers, declared below, reached the
  // same way every other still-vanilla-adjacent caller does).
  const { setStatusText } = useStatusText();
  // Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
  // markPollSuccess/showPollFailureWarning below call hide/showWarning
  // from useSnackbar() directly now, same "genuine descendant, wrapped
  // from outside AppRoot" reasoning as setStatusText above.
  const { showWarning, hide } = useSnackbar();

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
        window.renderRequestActivity?.();
      },
    });
    return helpers.pollForDataChanges;
  }, [setStatusText, showWarning, hide]);

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

  // Phase F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): see
  // this file's own header comment. A plain ref, same reasoning as
  // trackingRef above - nothing ever renders directly from this state;
  // renderRequestActivity/recordRecentRequestActivity already push derived
  // view-models out via their own window.updateReactRequestActivityBadges/
  // window.updateReactRecentRequestActivity bridges.
  const activityRef = useRef({ ...DEFAULT_REQUEST_ACTIVITY_STATE });

  // useMemo, not useEffect - same reasoning as pollForDataChanges above:
  // every piece here is a stable ref/bridge read, and the result needs to
  // be in this Provider's own Context value during render.
  const activityHelpers = useMemo(() => {
    const setRequestActivityCounter = (key, delta = 0) => {
      const activityState = activityRef.current;
      if (!Object.prototype.hasOwnProperty.call(activityState.counters, key)) {
        return;
      }
      const next =
        Number(activityState.counters[key] || 0) +
        (Number.isFinite(Number(delta)) ? Number(delta) : 0);
      const safeNext = Math.max(0, next);
      activityState.counters[key] = safeNext;
      if (safeNext > 0 && Number(activityState.startedAtMs[key] || 0) <= 0) {
        activityState.startedAtMs[key] = Date.now();
      }
      if (safeNext === 0) {
        activityState.startedAtMs[key] = 0;
      }
    };

    // Iterates REQUEST_ACTIVITY_LABELS generically rather than one
    // hand-written branch per key - see index.page.js's git history for why
    // (a hand-written-branch shape silently dropped the "labelApply" key
    // for a while before this plan's own predecessor caught it).
    const getActiveRequestActivityEntries = () => {
      const activityState = activityRef.current;
      return Object.keys(REQUEST_ACTIVITY_LABELS)
        .filter((key) => activityState.counters[key] > 0)
        .map((key) => ({
          label: `${REQUEST_ACTIVITY_LABELS[key]} x${activityState.counters[key]}`,
          elapsedMs: getElapsedFromStartMs(activityState.startedAtMs[key]),
        }));
    };

    const renderRequestActivity = () => {
      const activityState = activityRef.current;
      const activeEntries = getActiveRequestActivityEntries();
      const isAutoRunInProgress = Boolean(activityState.latestSchedulerState?.isAutoRunInProgress);
      const autoRunElapsedMs = isAutoRunInProgress
        ? getElapsedFromStartMs(
            Date.parse(String(activityState.latestSchedulerState?.lastAutoAttemptAt || '')),
          )
        : null;
      window.updateReactRequestActivityBadges?.(
        getRequestActivityBadges({ activeEntries, isAutoRunInProgress, autoRunElapsedMs }),
      );
    };

    const recordRecentRequestActivity = (key) => {
      const activityState = activityRef.current;
      const label = REQUEST_ACTIVITY_LABELS[key] || key;
      activityState.recentEntries = [
        { key, label, finishedAt: new Date().toISOString() },
        ...activityState.recentEntries,
      ].slice(0, RECENT_REQUEST_ACTIVITY_LIMIT);
      window.updateReactRecentRequestActivity?.(activityState.recentEntries);
    };

    const beginRequestActivity = (key) => {
      setRequestActivityCounter(key, 1);
      renderRequestActivity();
      let ended = false;
      return () => {
        if (ended) {
          return;
        }
        ended = true;
        setRequestActivityCounter(key, -1);
        renderRequestActivity();
        recordRecentRequestActivity(key);
      };
    };

    // pollBackfillStatus's own guard flags (isBackfillRunning/
    // isBackfillActionPending) are owned by BackfillStatusProvider.jsx
    // (Phase H.14, see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
    // cluster 4) - reached the same way useBackfillActions.jsx reaches
    // them, via window.getBackfillTrackingState, not a direct Context
    // read, since pollBackfillStatus runs from <PrDataPolling/>'s own
    // interval effect, a plain function call with no guaranteed Context
    // ancestry to that Provider. The real fetch work it delegates to
    // (loadBackfillStatus) stays vanilla-owned in index.page.js - it has
    // its own other real vanilla caller (initPage's initial load) this
    // phase doesn't touch.
    const pollBackfillStatus = async () => {
      const tracking = window.getBackfillTrackingState?.() || {};
      if (!tracking.isBackfillRunning || tracking.isBackfillActionPending) {
        return;
      }
      try {
        await window.loadBackfillStatus?.({ announce: true, includeLog: true });
      } catch (_error) {
        // Ignore polling failures and wait for the next interval.
      }
    };

    return { beginRequestActivity, renderRequestActivity, pollBackfillStatus };
  }, []);

  useEffect(() => {
    window.beginRequestActivity = (...args) => activityHelpers.beginRequestActivity(...args);
    window.renderRequestActivity = (...args) => activityHelpers.renderRequestActivity(...args);
    // Vanilla primitive exposed *for* this Provider: renderSchedulerStatus
    // (index.page.js, still called by loadSchedulerStatus and by
    // JobEventsProvider.jsx's real-time SSE path) pushes a fresh scheduler
    // object here instead of writing a bare module `let` - combines the
    // write + the re-render in one call, same "who writes when" structure
    // renderSchedulerStatus already had.
    window.setLatestSchedulerStateAndRender = (scheduler) => {
      activityRef.current.latestSchedulerState = scheduler || {};
      activityHelpers.renderRequestActivity();
    };
    // Read-side counterpart, for index.page.js's prDataTabOrchestrator
    // (its own stateGetters.getLatestSchedulerState) - the only other
    // vanilla reader of this state besides renderRequestActivity itself.
    window.getLatestSchedulerState = () => activityRef.current.latestSchedulerState;
    return () => {
      delete window.beginRequestActivity;
      delete window.renderRequestActivity;
      delete window.setLatestSchedulerStateAndRender;
      delete window.getLatestSchedulerState;
    };
  }, [activityHelpers]);

  const setPayload = useCallback((newPayload) => {
    setState((previous) => ({ ...previous, payload: newPayload }));
  }, []);

  // Phase H.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // same merge semantics as window.updateReactPrTable below (newPayload
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
  // same write target window.updateReactSelectedAuthorLogin already uses
  // (above) - exposed directly via Context too now, so
  // state/useNavigateToAuthorInsights.jsx can write the validated author
  // login without going through a window.* bridge for a React-to-React
  // call.
  const setSelectedAuthorLogin = useCallback((login) => {
    setState((previous) => ({ ...previous, selectedAuthorLogin: login || '' }));
  }, []);

  const value = {
    ...state,
    setPayload,
    applyFreshTablePayload,
    setStatsViewState,
    setSelectedAuthorLogin,
    pollForDataChanges,
    beginRequestActivity: activityHelpers.beginRequestActivity,
    renderRequestActivity: activityHelpers.renderRequestActivity,
    pollBackfillStatus: activityHelpers.pollBackfillStatus,
  };

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
