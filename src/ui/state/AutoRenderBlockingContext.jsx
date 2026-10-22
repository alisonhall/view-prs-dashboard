import { createContext, useContext } from 'react';

/**
 * Phase B (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): owns
 * the auto-render-blocking decision - whether an incoming background-poll
 * payload is safely applicable right now, must wait for a focused text
 * field to blur, or must wait for the user's unsaved edits to clear -
 * replacing `index.page.js`'s module-scope `pendingAutoRenderPayload`/
 * `hasDirtyPrSectionsFields` variables and the vanilla
 * `flushPendingAutoRender`/`renderAutoRenderBlockedIndicator` functions
 * that used to own this decision.
 *
 * The blocking state (which PRs/authors have unsaved edits) is computed by
 * `AutoRenderBlockingSync.jsx` from `NotesDirtyContext` and the drafts
 * Context, and pushed in through the actions Context's `setBlockingState`
 * (window-bridge elimination Phase 7.4; it was `index.page.js`'s
 * `recomputeDirtyPrSectionsFields`, called by both Providers through
 * window, pushing via `window.pushAutoRenderBlockingState`).
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context
 * in this migration.
 */
export const AutoRenderBlockingContext = createContext({
  isBlocked: false,
  statusText: '',
  discardAndApply: () => {},
  blockingPrNumbers: [],
  blockingAuthorInsightsLogins: [],
  blockingPrLabel: '',
});

/**
 * Window-bridge elimination Phase 3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * PrDataProvider's polling reads/writes the pending payload through these
 * instead of window.getHasDirtyPrSectionsFields/getPendingAutoRenderPayload/
 * setPendingAutoRenderPayload.
 *
 * A separate Context from AutoRenderBlockingContext above, on purpose: that
 * one's value changes whenever blocking state does (isBlocked/statusText),
 * and index.page.js pushes new state on every input/change/click in the PR
 * table. PrDataProvider (which wraps the whole table tree) must not
 * subscribe to that, or each such event re-renders every usePrData()
 * consumer. This object has a stable identity for the Provider's lifetime
 * (the functions read the Provider's ref, never render state), so it never
 * re-renders anything.
 *
 * Window-bridge elimination Phase 7: `setFreshPayloadApplier(fn)` -
 * PrDataProvider (a descendant) registers its applyFreshPrPayload here, and
 * this Provider calls it to apply a pending payload. It used to call
 * window.applyFreshPrPayload (index.page.js) instead.
 *
 * Window-bridge elimination Phase 7.4: `setBlockingState(state)` -
 * AutoRenderBlockingSync pushes the computed blocking state here. It was
 * window.pushAutoRenderBlockingState.
 */
export const AutoRenderBlockingActionsContext = createContext({
  getHasDirtyPrSectionsFields: () => false,
  getPendingAutoRenderPayload: () => null,
  setPendingAutoRenderPayload: () => {},
  setFreshPayloadApplier: () => {},
  setBlockingState: () => {},
});

export function useAutoRenderBlockingActions() {
  return useContext(AutoRenderBlockingActionsContext);
}

export function useAutoRenderBlocking() {
  return useContext(AutoRenderBlockingContext);
}
