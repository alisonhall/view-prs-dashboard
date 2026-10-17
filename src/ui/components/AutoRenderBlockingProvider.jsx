import { useCallback, useEffect, useRef, useState } from 'react';
import { AutoRenderBlockingContext } from '../state/AutoRenderBlockingContext';
import { createPrAutoRenderStateHelpers } from '../helpers/pr-auto-render-state.helpers.js';
import { createPrDataPollingHelpers } from '../helpers/pr-data-polling.helpers.js';
import { createPrAutoRenderIndicatorHelpers } from '../helpers/pr-auto-render-indicator.helpers.js';
import { useStatusText } from '../state/StatusTextContext';

// Each factory call below is genuinely zero-dependency for the pieces this
// Provider needs (computeHasDirtyPrSectionsFields/getPendingAutoRenderAction/
// buildAutoRenderBlockedStatusText take no required DI, same "stable,
// zero-per-render-state" precedent AuthorInsightsProvider.jsx's
// stableDisplay already established) - built once at module scope, not
// per-render.
const { computeHasDirtyPrSectionsFields } = createPrAutoRenderStateHelpers();
const { getPendingAutoRenderAction } = createPrDataPollingHelpers();
const { buildAutoRenderBlockedStatusText } = createPrAutoRenderIndicatorHelpers();

const EMPTY_BLOCKING_STATE = {
  dirtyFieldCount: 0,
  unsavedNotesCount: 0,
  blockingPrNumbers: [],
  blockingAuthorInsightsLogins: [],
  blockingPrLabel: '',
};

/**
 * Phase B (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): see
 * `AutoRenderBlockingContext.jsx`'s own comment for the overall shape.
 *
 * Publishes 4 bridges: `window.setPendingAutoRenderPayload` (the polling
 * orchestrator calls this instead of mutating a vanilla module variable),
 * `window.pushAutoRenderBlockingState` (`index.page.js`'s
 * `recomputeDirtyPrSectionsFields` calls this with the freshly-computed
 * blocking state instead of mutating `hasDirtyPrSectionsFields` directly),
 * and `window.getHasDirtyPrSectionsFields`/`window.getPendingAutoRenderPayload`
 * (read bridges for the polling orchestrator's own "should I even queue
 * this?" checks).
 *
 * A `useRef`-held plain object, not `useState` directly for the payload/
 * blocking-state themselves - the same "mutate a ref in place, force a
 * re-render via a version tick" pattern `AuthorInsightsDraftsProvider.jsx`
 * already established for the identical reason: this state doesn't
 * genuinely originate inside this component's own React tree, it's pushed
 * in from vanilla/other-Provider callers via a bridge, and the read bridges
 * above need to see a write immediately, in the same synchronous call stack,
 * regardless of whether React has re-rendered yet. An earlier version of
 * this file used plain `useState` + `flushSync` to get that same same-tick
 * freshness - that broke in the real app (not caught by jsdom/jest) because
 * `window.pushAutoRenderBlockingState` can be invoked from *inside* another
 * component's own `useEffect` (`NotesDirtyProvider`/`AuthorInsightsDraftsProvider`
 * calling `window.recomputeDirtyPrSectionsFields?.()`), and React disallows
 * `flushSync` from inside a lifecycle method - caught by the full Playwright
 * suite as a console-warning-as-error failure. Reading/writing a ref
 * directly sidesteps the problem entirely: no React commit needs to happen
 * for the write to be visible.
 *
 * The outer `#auto-render-blocked-indicator` panel's `hidden` attribute
 * stays a small, deliberate vanilla responsibility (toggled here as a side
 * effect, not left to React) - it also hosts the still-independently-
 * portaled `AutoRenderBlockedLinks.jsx` (into `#auto-render-blocked-pr-links`,
 * a *sibling* static child, not owned by this component) and restructuring
 * that nesting to make the whole panel React-owned would mean this
 * Provider's own `createPortal` destroying that sibling portal's target on
 * every render - not worth the risk for one `hidden` toggle. Only the
 * status text and "Discard unsaved" button move into real JSX.
 */
export function AutoRenderBlockingProvider({ children }) {
  const { setStatusText } = useStatusText();
  const stateRef = useRef({
    pendingAutoRenderPayload: null,
    blockingState: EMPTY_BLOCKING_STATE,
  });

  const [, setVersion] = useState(0);
  const bump = useCallback(() => {
    setVersion((previous) => previous + 1);
  }, []);

  const flushTimerRef = useRef(null);

  // The actual apply/wait-for-blur/wait-for-clean decision - mirrors
  // index.page.js's old flushPendingAutoRender exactly, including the
  // self-attaching one-time native blur listener (now covered by
  // index.html.test.js's "a poll that clears while a text field is
  // focused waits for blur..." test, added specifically to de-risk this
  // move before attempting it).
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
      window.applyFreshPrPayload?.(action.payload);
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

  // Deliberate small vanilla responsibility - see this file's own header
  // comment for why the outer panel's `hidden` attribute isn't React-owned.
  useEffect(() => {
    const indicator = document.getElementById('auto-render-blocked-indicator');
    if (indicator) {
      indicator.hidden = !isBlocked;
    }
  }, [isBlocked]);

  const discardAndApply = useCallback(() => {
    const payload = stateRef.current.pendingAutoRenderPayload;
    if (!payload) {
      return;
    }
    stateRef.current.pendingAutoRenderPayload = null;
    bump();
    window.applyFreshPrPayload?.(payload);
    // Phase H.8 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
    // statusText via useStatusText() directly (this component is a
    // genuine descendant of StatusTextProvider - see that Provider's own
    // header comment), composed with window.renderRequestActivity - same
    // reasoning as useRunScript.jsx's own comment on this exact
    // composition (nothing else re-renders the activity badges for this
    // one-shot action).
    setStatusText('Applied latest updates and discarded unsaved edits.');
    window.renderRequestActivity?.();
  }, [bump, setStatusText]);

  useEffect(() => {
    // Plain ref mutation + version-tick bump, not flushSync - see this
    // file's own header comment for why. Both setters schedule the same
    // flush check the old debounced flushPendingAutoRender did.
    window.setPendingAutoRenderPayload = (value) => {
      stateRef.current.pendingAutoRenderPayload = value;
      bump();
      scheduleFlushCheck();
    };
    window.pushAutoRenderBlockingState = (state) => {
      stateRef.current.blockingState = state || EMPTY_BLOCKING_STATE;
      bump();
      scheduleFlushCheck();
    };
    window.getHasDirtyPrSectionsFields = () =>
      computeHasDirtyPrSectionsFields(stateRef.current.blockingState);
    window.getPendingAutoRenderPayload = () => stateRef.current.pendingAutoRenderPayload;
    return () => {
      delete window.setPendingAutoRenderPayload;
      delete window.pushAutoRenderBlockingState;
      delete window.getHasDirtyPrSectionsFields;
      delete window.getPendingAutoRenderPayload;
    };
  }, [bump, scheduleFlushCheck]);

  const { blockingState } = stateRef.current;
  const statusText = buildAutoRenderBlockedStatusText({
    dirtyFieldCount: blockingState.dirtyFieldCount,
    unsavedNotesCount: blockingState.unsavedNotesCount,
    blockingAuthorInsightsCount: (blockingState.blockingAuthorInsightsLogins || []).length,
  });

  const value = { isBlocked, statusText, discardAndApply };

  return (
    <AutoRenderBlockingContext.Provider value={value}>{children}</AutoRenderBlockingContext.Provider>
  );
}
