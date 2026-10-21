import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPrBackfillHelpers } from '../helpers/pr-backfill.helpers.js';
import {
  BackfillStatusActionsContext,
  BackfillStatusContext,
  DEFAULT_BACKFILL_BADGES,
  DEFAULT_BACKFILL_BUTTON_STATE,
  DEFAULT_BACKFILL_DETAILS_TEXT,
  DEFAULT_BACKFILL_LOG_TEXT,
} from '../state/BackfillStatusContext';
import { useStatusText } from '../state/StatusTextContext';

const { getBackfillStatusViewModel, getBackfillStateKey } = createPrBackfillHelpers();

/**
 * Phase H.14 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 4 "Backfill status rendering"): owns `isBackfillRunning`/
 * `isBackfillActionPending`/`supportsBackfillLogPolling` (previously plain
 * module `let`s in index.page.js) and the `renderBackfillStatus`/
 * `updateBackfillStatusFromPayload`/`setBackfillLogMessage` functions that
 * wrote them - same shape as StatusTextProvider.jsx (Phase H.8): this
 * Provider becomes the thing that *answers*
 * `window.getBackfillTrackingState`/`setSupportsBackfillLogPolling`/
 * `setIsBackfillActionPending`/`updateBackfillStatusFromPayload`/
 * `setBackfillLogMessage`/`renderBackfillStatus` now, instead of
 * index.page.js.
 *
 * index.page.js keeps genuine vanilla callers of all 6 bridges (its own
 * `loadBackfillStatus` instance's DI, `loadStoredData`'s own DI, the
 * payload-apply pipeline, `initPage`'s initial-load catch block, and the
 * `viewprs:react-ready` replay for the one bridge-not-ready-yet race this
 * phase doesn't remove - see its own inline comments) - this Provider
 * doesn't eliminate index.page.js's vanilla pipeline, it just gives both
 * that pipeline and useBackfillActions.jsx (state/) one shared, real
 * source of truth instead of two independently-drifting copies.
 *
 * `window.updateReactBackfillBadges`/`updateReactBackfillButtonState`/
 * `updateReactBackfillDetailsText` (react-app.jsx's own AppRoot) stay
 * exactly as they are - this Provider calls into them, the same
 * "downstream rendering target" relationship `renderBackfillStatus` always
 * had, just relocated. Deliberately drops the old DOM-existence guard
 * (`#backfill-badges`/`#backfill-details` both present) the old vanilla
 * `renderBackfillStatus` used to bail out on - a Provider doesn't need
 * those DOM nodes to exist to hold its own state, and in every real page
 * load and test harness that mounts this Provider, both containers are
 * already-present static markup, never conditionally rendered.
 *
 * Reads/writes go through refs, not the `useState` values directly,
 * inside the bridge functions - `handleBackfillAction` (pr-backfill-
 * actions.helpers.js) calls `setIsBackfillActionPending`/
 * `updateBackfillStatusFromPayload`/`getIsBackfillRunning` back-to-back,
 * synchronously, inside one async function body, with no guarantee a
 * React render+effect cycle completes between those calls. A bridge
 * defined inside a `useEffect` keyed on these same state values would
 * only see last-render's values until that cycle catches up - exactly the
 * module-`let` immediacy this migration must preserve (the old vanilla
 * code read/wrote these as plain synchronous variables, never through
 * React's render cycle at all). Refs give every bridge call the true
 * current value instantly, same as before; `useState` stays only for
 * `useBackfillStatus()`'s own reactive Context value (BackfillLogControls.
 * jsx's render-time read of `isBackfillRunning`), a different consumer
 * with different (and correct) requirements.
 *
 * Window-bridge elimination Phase 4 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * also owns the status badges, details text and log text (AppRoot used to
 * hold them, with this Provider pushing into them through
 * `window.updateReactBackfillBadges`/`DetailsText`/`LogText` - an ancestor
 * writing down into its own descendant). The first two had no other
 * caller and are deleted; `window.updateReactBackfillLogText` stays for
 * index.page.js's one vanilla replay of the latest log message. All the
 * functions below are exposed on BackfillStatusActionsContext (stable, so
 * PrDataProvider can read them without re-rendering on every update), and
 * the state on BackfillStatusContext. The `window.*` bridges that remain
 * exist only for index.page.js's own vanilla callers, and go away with it.
 */

export function BackfillStatusProvider({ children }) {
  const { setStatusText } = useStatusText();
  const [isBackfillRunning, setIsBackfillRunningState] = useState(false);
  const [isBackfillActionPending, setIsBackfillActionPendingState] = useState(false);
  const [supportsBackfillLogPolling, setSupportsBackfillLogPollingState] = useState(true);
  const [backfillButtonState, setBackfillButtonStateRaw] = useState(DEFAULT_BACKFILL_BUTTON_STATE);
  const [backfillBadges, setBackfillBadges] = useState(DEFAULT_BACKFILL_BADGES);
  const [backfillDetailsText, setBackfillDetailsText] = useState(DEFAULT_BACKFILL_DETAILS_TEXT);
  const [backfillLogText, setBackfillLogText] = useState(DEFAULT_BACKFILL_LOG_TEXT);
  const [backfillLogUpdateTick, setBackfillLogUpdateTick] = useState(0);

  const isBackfillRunningRef = useRef(isBackfillRunning);
  const isBackfillActionPendingRef = useRef(isBackfillActionPending);
  const supportsBackfillLogPollingRef = useRef(supportsBackfillLogPolling);
  const lastBackfillStateKeyRef = useRef('');

  // Every function below is a useCallback over refs/useState setters only, so
  // each keeps one identity for this Provider's lifetime - see
  // BackfillStatusActionsContext.
  const setBackfillButtonState = useCallback((state) => {
    // A falsy value resets to the default, as the old bridge always did.
    setBackfillButtonStateRaw(state || DEFAULT_BACKFILL_BUTTON_STATE);
  }, []);
  const setIsBackfillRunning = useCallback((value) => {
    isBackfillRunningRef.current = Boolean(value);
    setIsBackfillRunningState(Boolean(value));
  }, []);
  const setIsBackfillActionPending = useCallback((value) => {
    isBackfillActionPendingRef.current = Boolean(value);
    setIsBackfillActionPendingState(Boolean(value));
  }, []);
  const setSupportsBackfillLogPolling = useCallback((value) => {
    supportsBackfillLogPollingRef.current = Boolean(value);
    setSupportsBackfillLogPollingState(Boolean(value));
  }, []);
  const setBackfillLogMessage = useCallback((message) => {
    setBackfillLogText(message);
    setBackfillLogUpdateTick((tick) => tick + 1);
    return true;
  }, []);

  // Reads the refs (not the state above), so a caller holding this across an
  // async flow still sees a setter's write immediately - same synchronous-read
  // semantics window.getBackfillTrackingState has.
  const getBackfillTrackingState = useCallback(
    () => ({
      supportsBackfillLogPolling: supportsBackfillLogPollingRef.current,
      isBackfillRunning: isBackfillRunningRef.current,
      isBackfillActionPending: isBackfillActionPendingRef.current,
    }),
    [],
  );

  const renderBackfillStatus = useCallback(
    (backfillRaw = {}) => {
      const backfill = backfillRaw || {};
      const viewModel = getBackfillStatusViewModel({
        backfillRaw: backfill,
        isBackfillActionPending: isBackfillActionPendingRef.current,
      });

      setBackfillBadges({ badges: viewModel.badges });
      setBackfillDetailsText(viewModel.detailsText);
      setBackfillButtonState(viewModel.buttonState);
      setIsBackfillRunning(viewModel.isBackfillRunning);
      lastBackfillStateKeyRef.current = viewModel.stateKey;
    },
    [setBackfillButtonState, setIsBackfillRunning],
  );

  const updateBackfillStatusFromPayload = useCallback(
    (payload = {}, { announce = false } = {}) => {
      const backfill = payload?.backfill || payload || {};
      const previousStateKey = lastBackfillStateKeyRef.current;
      const nextStateKey = getBackfillStateKey(backfill);

      renderBackfillStatus(backfill);

      if (announce && nextStateKey !== previousStateKey) {
        setStatusText(backfill.summary || 'Backfill status updated');
        window.renderRequestActivity?.();
      }
    },
    [renderBackfillStatus, setStatusText],
  );

  // Bridges for index.page.js (vanilla), which has no Context access. Every
  // caller of these inside React now uses BackfillStatusActionsContext; these
  // exist only for index.page.js's own loadBackfillStatus/loadStoredData/
  // payload-apply pipeline and its react-ready replay, and are deleted with
  // it (Phase 7).
  useEffect(() => {
    window.getBackfillTrackingState = getBackfillTrackingState;
    window.setSupportsBackfillLogPolling = setSupportsBackfillLogPolling;
    window.setIsBackfillActionPending = setIsBackfillActionPending;
    window.updateBackfillStatusFromPayload = updateBackfillStatusFromPayload;
    window.setBackfillLogMessage = setBackfillLogMessage;
    window.updateReactBackfillLogText = setBackfillLogMessage;
    window.renderBackfillStatus = renderBackfillStatus;
    window.updateReactBackfillButtonState = setBackfillButtonState;

    return () => {
      delete window.getBackfillTrackingState;
      delete window.setSupportsBackfillLogPolling;
      delete window.setIsBackfillActionPending;
      delete window.updateBackfillStatusFromPayload;
      delete window.setBackfillLogMessage;
      delete window.updateReactBackfillLogText;
      delete window.renderBackfillStatus;
      delete window.updateReactBackfillButtonState;
    };
  }, [
    getBackfillTrackingState,
    setSupportsBackfillLogPolling,
    setIsBackfillActionPending,
    updateBackfillStatusFromPayload,
    setBackfillLogMessage,
    renderBackfillStatus,
    setBackfillButtonState,
  ]);

  const value = useMemo(
    () => ({
      backfillButtonState,
      backfillBadges,
      backfillDetailsText,
      backfillLogText,
      backfillLogUpdateTick,
      isBackfillRunning,
      isBackfillActionPending,
      supportsBackfillLogPolling,
    }),
    [
      backfillButtonState,
      backfillBadges,
      backfillDetailsText,
      backfillLogText,
      backfillLogUpdateTick,
      isBackfillRunning,
      isBackfillActionPending,
      supportsBackfillLogPolling,
    ],
  );

  const actions = useMemo(
    () => ({
      getBackfillTrackingState,
      setBackfillButtonState,
      setIsBackfillActionPending,
      setSupportsBackfillLogPolling,
      updateBackfillStatusFromPayload,
      renderBackfillStatus,
      setBackfillLogMessage,
    }),
    [
      getBackfillTrackingState,
      setBackfillButtonState,
      setIsBackfillActionPending,
      setSupportsBackfillLogPolling,
      updateBackfillStatusFromPayload,
      renderBackfillStatus,
      setBackfillLogMessage,
    ],
  );

  return (
    <BackfillStatusActionsContext.Provider value={actions}>
      <BackfillStatusContext.Provider value={value}>{children}</BackfillStatusContext.Provider>
    </BackfillStatusActionsContext.Provider>
  );
}
