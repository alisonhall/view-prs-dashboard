import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  createPrBackfillHelpers,
  type BackfillButtonState,
  type BackfillStatus,
} from '../helpers/pr-backfill.helpers.ts';
import { createPrBackfillActionHelpers } from '../helpers/pr-backfill-actions.helpers.ts';
import {
  BACKFILL_LOG_TAIL_LINES,
  BackfillStatusActionsContext,
  BackfillStatusContext,
  DEFAULT_BACKFILL_BADGES,
  DEFAULT_BACKFILL_BUTTON_STATE,
  DEFAULT_BACKFILL_DETAILS_TEXT,
  DEFAULT_BACKFILL_LOG_TEXT,
  type BackfillStatusActionsValue,
  type BackfillStatusValue,
} from '../state/BackfillStatusContext';
import { useStatusText } from '../state/StatusTextContext';
import { useRequestActivity } from '../state/RequestActivityContext';

const { getBackfillStatusViewModel, getBackfillStateKey, formatBackfillLogMessage } = createPrBackfillHelpers();

/**
 * Owns the backfill tracking flags and the Backfill tab's display state
 * (see BackfillStatusContext.tsx): `isBackfillRunning`/
 * `isBackfillActionPending`/`supportsBackfillLogPolling`, the status
 * badges, details text, button state and log text, and the
 * `renderBackfillStatus`/`updateBackfillStatusFromPayload`/
 * `setBackfillLogMessage`/`loadBackfillStatus` functions that write them.
 * It publishes no window bridges.
 *
 * The functions read/write refs, not the `useState` values:
 * `handleBackfillAction` (pr-backfill-actions.helpers.ts) calls
 * `setIsBackfillActionPending`/`updateBackfillStatusFromPayload`/
 * `getIsBackfillRunning` back-to-back inside one async function, with no
 * guarantee a React render happens between those calls, so each call must
 * see the previous one's write immediately. `useState` is only for
 * `useBackfillStatus()`'s reactive value (e.g. BackfillLogControls.jsx's
 * render-time read of `isBackfillRunning`).
 *
 * It doesn't need the `#backfill-badges`/`#backfill-details` nodes to
 * exist to hold its state; AppRoot renders the state into them.
 */
export function BackfillStatusProvider({ children }: { children?: ReactNode }) {
  const { setStatusText } = useStatusText();
  const { renderRequestActivity } = useRequestActivity();
  const [isBackfillRunning, setIsBackfillRunningState] = useState(false);
  const [isBackfillActionPending, setIsBackfillActionPendingState] = useState(false);
  const [supportsBackfillLogPolling, setSupportsBackfillLogPollingState] = useState(true);
  const [backfillButtonState, setBackfillButtonStateRaw] = useState<BackfillButtonState>(DEFAULT_BACKFILL_BUTTON_STATE);
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
  const setBackfillButtonState = useCallback((state: BackfillButtonState | null | undefined) => {
    // A falsy value resets to the default.
    setBackfillButtonStateRaw(state || DEFAULT_BACKFILL_BUTTON_STATE);
  }, []);
  const setIsBackfillRunning = useCallback((value: boolean) => {
    isBackfillRunningRef.current = Boolean(value);
    setIsBackfillRunningState(Boolean(value));
  }, []);
  const setIsBackfillActionPending = useCallback((value: boolean) => {
    isBackfillActionPendingRef.current = Boolean(value);
    setIsBackfillActionPendingState(Boolean(value));
  }, []);
  const setSupportsBackfillLogPolling = useCallback((value: boolean) => {
    supportsBackfillLogPollingRef.current = Boolean(value);
    setSupportsBackfillLogPollingState(Boolean(value));
  }, []);
  const setBackfillLogMessage = useCallback((message: string) => {
    setBackfillLogText(message);
    setBackfillLogUpdateTick((tick) => tick + 1);
  }, []);

  // Reads the refs (not the state above), so a caller holding this across an
  // async flow still sees a setter's write immediately.
  const getBackfillTrackingState = useCallback(
    () => ({
      supportsBackfillLogPolling: supportsBackfillLogPollingRef.current,
      isBackfillRunning: isBackfillRunningRef.current,
      isBackfillActionPending: isBackfillActionPendingRef.current,
    }),
    [],
  );

  const renderBackfillStatus = useCallback(
    (backfillRaw: BackfillStatus | null = {}) => {
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

  const updateBackfillStatusFromPayload = useCallback<BackfillStatusActionsValue['updateBackfillStatusFromPayload']>(
    (payload = {}, { announce = false } = {}) => {
      const backfill = payload?.backfill || payload || {};
      const previousStateKey = lastBackfillStateKeyRef.current;
      const nextStateKey = getBackfillStateKey(backfill);

      renderBackfillStatus(backfill);

      if (announce && nextStateKey !== previousStateKey) {
        setStatusText(backfill.summary || 'Backfill status updated');
        renderRequestActivity();
      }
    },
    [renderBackfillStatus, setStatusText, renderRequestActivity],
  );

  // GET the status (and, with
  // includeLog, the log tail) and render it here. Only the factory's load
  // functions are used, so only their DI is passed; the action functions
  // (handleBackfillAction) live in useBackfillActions.tsx's own instance.
  // autoScrollBackfillLogToBottom is a no-op for the same reason as there:
  // BackfillLogControls syncs its scroll position itself on each log update.
  const loadBackfillStatus = useMemo(
    () =>
      createPrBackfillActionHelpers({
        fetch: (input) => fetch(input),
        updateBackfillStatusFromPayload,
        setBackfillLogMessage,
        autoScrollBackfillLogToBottom: () => {},
        formatBackfillLogMessage,
        getSupportsBackfillLogPolling: () => supportsBackfillLogPollingRef.current,
        setSupportsBackfillLogPolling,
        backfillLogTailLines: BACKFILL_LOG_TAIL_LINES,
      }).loadBackfillStatus,
    [updateBackfillStatusFromPayload, setBackfillLogMessage, setSupportsBackfillLogPolling],
  );

  const value = useMemo<BackfillStatusValue>(
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

  const actions = useMemo<BackfillStatusActionsValue>(
    () => ({
      loadBackfillStatus,
      getBackfillTrackingState,
      setBackfillButtonState,
      setIsBackfillActionPending,
      setSupportsBackfillLogPolling,
      updateBackfillStatusFromPayload,
      renderBackfillStatus,
      setBackfillLogMessage,
    }),
    [
      loadBackfillStatus,
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
