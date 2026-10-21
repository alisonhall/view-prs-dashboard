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
 * `NotesDirtyProvider.jsx`/`AuthorInsightsDraftsProvider.jsx` still call
 * `window.recomputeDirtyPrSectionsFields?.()` exactly as before - that
 * function's own body changed (it now pushes the freshly-computed
 * blocking state into this Provider via `window.pushAutoRenderBlockingState`
 * instead of mutating a vanilla module variable), but the "who notifies
 * whom" structure is unchanged. See `AutoRenderBlockingProvider.jsx`'s own
 * comment for why this bridge isn't fully closeable yet
 * (`AuthorInsightsDraftsContext.jsx`'s own header comment already flags
 * that specific extension as a separate, later step).
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context
 * in this migration.
 */
export const AutoRenderBlockingContext = createContext({
  isBlocked: false,
  statusText: '',
  discardAndApply: () => {},
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
 */
export const AutoRenderBlockingActionsContext = createContext({
  getHasDirtyPrSectionsFields: () => false,
  getPendingAutoRenderPayload: () => null,
  setPendingAutoRenderPayload: () => {},
});

export function useAutoRenderBlockingActions() {
  return useContext(AutoRenderBlockingActionsContext);
}

export function useAutoRenderBlocking() {
  return useContext(AutoRenderBlockingContext);
}
