import { createContext, useContext } from 'react';

/**
 * Phase H.14 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 4 "Backfill status rendering"): the backfill tracking flags
 * (`isBackfillRunning`/`isBackfillActionPending`/`supportsBackfillLogPolling`)
 * used to live as plain module `let`s in index.page.js, reached by
 * useBackfillActions.jsx (state/) only through the
 * `window.getBackfillTrackingState`/`setSupportsBackfillLogPolling`/
 * `setIsBackfillActionPending` reverse bridges. This Context makes
 * BackfillStatusProvider.jsx the single real owner - both index.page.js's
 * own vanilla `loadBackfillStatus` instance and useBackfillActions.jsx's
 * hook now read/write the exact same state, via the same bridges the
 * Provider itself answers (index.page.js has no Context access, so it
 * can't call useBackfillStatus() directly - see that Provider's own
 * comment).
 *
 * Default value (unwrapped) is a safe no-op shape, matching every other
 * Context in this app.
 */
// Window-bridge elimination Phase 3d (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// the Backfill tab's 4 button-disabled flags used to be AppRoot's own local
// state, written by BackfillStatusProvider (and useBackfillActions) through
// window.updateReactBackfillButtonState - a bridge pointing *down* from an
// ancestor into its own descendant. Owned here instead; AppRoot reads it
// back out. Matches the static markup's own implicit initial state (no
// button starts out with a disabled attribute).
export const DEFAULT_BACKFILL_BUTTON_STATE = {
  startDisabled: false,
  stopDisabled: false,
  refreshDisabled: false,
  refreshLogDisabled: false,
};

export const BackfillStatusContext = createContext({
  backfillButtonState: DEFAULT_BACKFILL_BUTTON_STATE,
  setBackfillButtonState: () => {},
  getBackfillTrackingState: () => ({ supportsBackfillLogPolling: true, isBackfillRunning: false }),
  isBackfillRunning: false,
  isBackfillActionPending: false,
  supportsBackfillLogPolling: true,
  setIsBackfillActionPending: () => {},
  setSupportsBackfillLogPolling: () => {},
});

export function useBackfillStatus() {
  return useContext(BackfillStatusContext);
}
