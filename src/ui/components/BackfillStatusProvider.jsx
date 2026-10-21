import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPrBackfillHelpers } from '../helpers/pr-backfill.helpers.js';
import { BackfillStatusContext, DEFAULT_BACKFILL_BUTTON_STATE } from '../state/BackfillStatusContext';
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
 */
export function BackfillStatusProvider({ children }) {
  const { setStatusText } = useStatusText();
  const [isBackfillRunning, setIsBackfillRunningState] = useState(false);
  const [isBackfillActionPending, setIsBackfillActionPendingState] = useState(false);
  const [supportsBackfillLogPolling, setSupportsBackfillLogPollingState] = useState(true);

  // Window-bridge elimination Phase 3d: owned here (was AppRoot's local
  // state, pushed in through window.updateReactBackfillButtonState). A
  // falsy value resets to the default, as that bridge always did.
  const [backfillButtonState, setBackfillButtonStateRaw] = useState(DEFAULT_BACKFILL_BUTTON_STATE);
  const setBackfillButtonState = useCallback((state) => {
    setBackfillButtonStateRaw(state || DEFAULT_BACKFILL_BUTTON_STATE);
  }, []);

  const isBackfillRunningRef = useRef(isBackfillRunning);
  const isBackfillActionPendingRef = useRef(isBackfillActionPending);
  const supportsBackfillLogPollingRef = useRef(supportsBackfillLogPolling);
  const lastBackfillStateKeyRef = useRef('');

  const setIsBackfillRunning = (value) => {
    isBackfillRunningRef.current = Boolean(value);
    setIsBackfillRunningState(Boolean(value));
  };
  const setIsBackfillActionPending = (value) => {
    isBackfillActionPendingRef.current = Boolean(value);
    setIsBackfillActionPendingState(Boolean(value));
  };
  const setSupportsBackfillLogPolling = (value) => {
    supportsBackfillLogPollingRef.current = Boolean(value);
    setSupportsBackfillLogPollingState(Boolean(value));
  };

  useEffect(() => {
    const renderBackfillStatus = (backfillRaw = {}) => {
      const backfill = backfillRaw || {};
      const viewModel = getBackfillStatusViewModel({
        backfillRaw: backfill,
        isBackfillActionPending: isBackfillActionPendingRef.current,
      });

      window.updateReactBackfillBadges?.(viewModel.badges);
      window.updateReactBackfillDetailsText?.(viewModel.detailsText);
      setBackfillButtonState(viewModel.buttonState);
      setIsBackfillRunning(viewModel.isBackfillRunning);
      lastBackfillStateKeyRef.current = viewModel.stateKey;
    };

    const updateBackfillStatusFromPayload = (payload = {}, { announce = false } = {}) => {
      const backfill = payload?.backfill || payload || {};
      const previousStateKey = lastBackfillStateKeyRef.current;
      const nextStateKey = getBackfillStateKey(backfill);

      renderBackfillStatus(backfill);

      if (announce && nextStateKey !== previousStateKey) {
        setStatusText(backfill.summary || 'Backfill status updated');
        window.renderRequestActivity?.();
      }
    };

    window.getBackfillTrackingState = () => ({
      supportsBackfillLogPolling: supportsBackfillLogPollingRef.current,
      isBackfillRunning: isBackfillRunningRef.current,
      isBackfillActionPending: isBackfillActionPendingRef.current,
    });
    window.setSupportsBackfillLogPolling = setSupportsBackfillLogPolling;
    window.setIsBackfillActionPending = setIsBackfillActionPending;
    window.updateBackfillStatusFromPayload = (...args) => updateBackfillStatusFromPayload(...args);
    window.setBackfillLogMessage = (message) => {
      window.updateReactBackfillLogText?.(message);
    };
    window.renderBackfillStatus = (...args) => renderBackfillStatus(...args);

    return () => {
      delete window.getBackfillTrackingState;
      delete window.setSupportsBackfillLogPolling;
      delete window.setIsBackfillActionPending;
      delete window.updateBackfillStatusFromPayload;
      delete window.setBackfillLogMessage;
      delete window.renderBackfillStatus;
    };
  }, [setStatusText, setBackfillButtonState]);

  // Still published for index.page.js (vanilla), which writes the button
  // state too and has no Context access - the one remaining caller, so this
  // bridge goes away with index.page.js (Phase 7).
  useEffect(() => {
    window.updateReactBackfillButtonState = (state) => {
      setBackfillButtonState(state);
    };
    return () => {
      delete window.updateReactBackfillButtonState;
    };
  }, [setBackfillButtonState]);

  // Reads the refs (not the state above), so a caller holding this across
  // an async flow still sees a setter's write immediately - same
  // synchronous-read semantics window.getBackfillTrackingState has.
  const getBackfillTrackingState = () => ({
    supportsBackfillLogPolling: supportsBackfillLogPollingRef.current,
    isBackfillRunning: isBackfillRunningRef.current,
  });

  const value = useMemo(
    () => ({
      getBackfillTrackingState,
      backfillButtonState,
      setBackfillButtonState,
      isBackfillRunning,
      isBackfillActionPending,
      supportsBackfillLogPolling,
      setIsBackfillActionPending,
      setSupportsBackfillLogPolling,
    }),
    [
      isBackfillRunning,
      isBackfillActionPending,
      supportsBackfillLogPolling,
      backfillButtonState,
      setBackfillButtonState,
    ],
  );

  return <BackfillStatusContext.Provider value={value}>{children}</BackfillStatusContext.Provider>;
}
