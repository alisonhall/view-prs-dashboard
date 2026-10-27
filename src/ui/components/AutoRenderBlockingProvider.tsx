import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AutoRenderBlockingActionsContext,
  AutoRenderBlockingContext,
  type AutoRenderBlockingActionsValue,
  type AutoRenderBlockingValue,
} from '../state/AutoRenderBlockingContext';
import {
  createPrAutoRenderStateHelpers,
  type AutoRenderBlockingState,
} from '../helpers/pr-auto-render-state.helpers.ts';
import { createPrDataPollingHelpers } from '../helpers/pr-data-polling.helpers.ts';
import { createPrAutoRenderIndicatorHelpers } from '../helpers/pr-auto-render-indicator.helpers.ts';
import { useStatusText } from '../state/StatusTextContext';
import { useRequestActivity } from '../state/RequestActivityContext';
import type { PrDataPayload } from '../types/pr-data.ts';

// The pieces this Provider needs take no dependencies, so they're built
// once here, not per render.
const { computeHasDirtyPrSectionsFields } = createPrAutoRenderStateHelpers();
const { getPendingAutoRenderAction } = createPrDataPollingHelpers();
const { buildAutoRenderBlockedStatusText } = createPrAutoRenderIndicatorHelpers();

const EMPTY_BLOCKING_STATE: AutoRenderBlockingState = {
  dirtyFieldCount: 0,
  unsavedNotesCount: 0,
  blockingPrNumbers: [],
  blockingAuthorInsightsLogins: [],
  blockingPrLabel: '',
};

interface BlockingRefState {
  pendingAutoRenderPayload: PrDataPayload | null;
  blockingState: AutoRenderBlockingState;
}

/**
 * Owns the auto-render-blocking decision (see
 * `AutoRenderBlockingContext.tsx`'s comment for the overall shape). It
 * publishes no window bridges.
 *
 * The pending payload and blocking state live in a `useRef`-held object,
 * not `useState`, with a version tick to re-render - the same pattern as
 * `AuthorInsightsDraftsProvider.tsx`: they are pushed in by other
 * components (PrDataProvider's polling, AutoRenderBlockingSync) through the
 * actions Context, and the actions' read functions must see a write
 * immediately, in the same synchronous call stack, whether or not React
 * has re-rendered. An earlier `useState` + `flushSync` version broke in the
 * real app (not caught by jsdom/jest): the blocking-state push runs inside
 * AutoRenderBlockingSync's `useEffect`, and React disallows `flushSync`
 * there (caught by the Playwright suite as a console-warning-as-error).
 *
 * The app header's AutoUpdatePausedBanner shows `isBlocked` (UI redesign
 * phase 9a; this Provider used to toggle a static panel's `hidden`).
 */
export function AutoRenderBlockingProvider({ children }: { children?: ReactNode }) {
  const { setStatusText } = useStatusText();
  const { renderRequestActivity } = useRequestActivity();
  const stateRef = useRef<BlockingRefState>({
    pendingAutoRenderPayload: null,
    blockingState: EMPTY_BLOCKING_STATE,
  });

  const [, setVersion] = useState(0);
  const bump = useCallback(() => {
    setVersion((previous) => previous + 1);
  }, []);

  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // PrDataProvider (a descendant) registers its applyFreshPrPayload here.
  const freshPayloadApplierRef = useRef<((payload: PrDataPayload) => void) | null>(null);
  const setFreshPayloadApplier = useCallback<AutoRenderBlockingActionsValue['setFreshPayloadApplier']>((applier) => {
    freshPayloadApplierRef.current = typeof applier === 'function' ? applier : null;
  }, []);

  // The apply/wait-for-blur/wait-for-clean decision, including the
  // self-attaching one-time native blur listener (covered by
  // index.html.test.js's "a poll that clears while a text field is
  // focused waits for blur..." test).
  const runFlushCheck = useCallback(() => {
    const { pendingAutoRenderPayload, blockingState } = stateRef.current;
    const action = getPendingAutoRenderAction({
      pendingPayload: pendingAutoRenderPayload,
      focusedElement: document.activeElement,
      hasDirtyPrSectionsFields: computeHasDirtyPrSectionsFields(blockingState),
    });
    if (action.type === 'wait-for-blur') {
      document.activeElement?.addEventListener?.('blur', runFlushCheck, { once: true });
      return;
    }
    if (action.type === 'render') {
      stateRef.current.pendingAutoRenderPayload = null;
      bump();
      freshPayloadApplierRef.current?.(action.payload);
    }
    // 'none' / 'wait-for-clean': no-op, wait for the next state change.
  }, [bump]);

  const scheduleFlushCheck = useCallback(() => {
    clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(runFlushCheck, 0);
  }, [runFlushCheck]);

  useEffect(() => () => clearTimeout(flushTimerRef.current), []);

  const isBlocked =
    Boolean(stateRef.current.pendingAutoRenderPayload) &&
    computeHasDirtyPrSectionsFields(stateRef.current.blockingState);

  const discardAndApply = useCallback(() => {
    const payload = stateRef.current.pendingAutoRenderPayload;
    if (!payload) {
      return;
    }
    stateRef.current.pendingAutoRenderPayload = null;
    bump();
    freshPayloadApplierRef.current?.(payload);
    // Nothing else re-renders the activity badges for this one-shot action
    // (same as useRunScript.tsx).
    setStatusText('Applied latest updates and discarded unsaved edits.');
    renderRequestActivity();
  }, [bump, setStatusText, renderRequestActivity]);

  // Ref mutation + version tick, not flushSync (see the header comment).
  // Both setters schedule a flush check.
  const setPendingAutoRenderPayload = useCallback<AutoRenderBlockingActionsValue['setPendingAutoRenderPayload']>(
    (value) => {
      stateRef.current.pendingAutoRenderPayload = value;
      bump();
      scheduleFlushCheck();
    },
    [bump, scheduleFlushCheck],
  );
  const getHasDirtyPrSectionsFields = useCallback(
    () => computeHasDirtyPrSectionsFields(stateRef.current.blockingState),
    [],
  );
  const getPendingAutoRenderPayload = useCallback(() => stateRef.current.pendingAutoRenderPayload, []);
  const setBlockingState = useCallback<AutoRenderBlockingActionsValue['setBlockingState']>(
    (state) => {
      stateRef.current.blockingState = state || EMPTY_BLOCKING_STATE;
      bump();
      scheduleFlushCheck();
    },
    [bump, scheduleFlushCheck],
  );

  const { blockingState } = stateRef.current;
  const statusText = buildAutoRenderBlockedStatusText({
    dirtyFieldCount: blockingState.dirtyFieldCount,
    unsavedNotesCount: blockingState.unsavedNotesCount,
    blockingAuthorInsightsCount: (blockingState.blockingAuthorInsightsLogins || []).length,
  });

  // Both memoized: each push of blocking state re-renders this Provider, and
  // an un-memoized value object would re-render every consumer each time
  // even when nothing they read changed.
  const value = useMemo<AutoRenderBlockingValue>(
    () => ({
      isBlocked,
      statusText,
      discardAndApply,
      blockingPrNumbers: blockingState.blockingPrNumbers || [],
      blockingAuthorInsightsLogins: blockingState.blockingAuthorInsightsLogins || [],
      blockingPrLabel: blockingState.blockingPrLabel || '',
    }),
    [isBlocked, statusText, discardAndApply, blockingState],
  );
  const actions = useMemo<AutoRenderBlockingActionsValue>(
    () => ({
      getHasDirtyPrSectionsFields,
      getPendingAutoRenderPayload,
      setPendingAutoRenderPayload,
      setFreshPayloadApplier,
      setBlockingState,
    }),
    [getHasDirtyPrSectionsFields, getPendingAutoRenderPayload, setPendingAutoRenderPayload, setFreshPayloadApplier, setBlockingState],
  );

  return (
    <AutoRenderBlockingActionsContext.Provider value={actions}>
      <AutoRenderBlockingContext.Provider value={value}>{children}</AutoRenderBlockingContext.Provider>
    </AutoRenderBlockingActionsContext.Provider>
  );
}
