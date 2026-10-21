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
  // Window-bridge elimination Phase 3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // PrDataProvider's polling reads/writes the pending payload through these
  // instead of window.getHasDirtyPrSectionsFields/getPendingAutoRenderPayload/
  // setPendingAutoRenderPayload. Stable identities (read the Provider's
  // ref, never render state), so they're safe in useMemo/useCallback deps.
  getHasDirtyPrSectionsFields: () => false,
  getPendingAutoRenderPayload: () => null,
  setPendingAutoRenderPayload: () => {},
});

export function useAutoRenderBlocking() {
  return useContext(AutoRenderBlockingContext);
}
