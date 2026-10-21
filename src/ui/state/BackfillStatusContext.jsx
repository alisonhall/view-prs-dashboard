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
 * own vanilla `loadBackfillStatus` instance and the React side read/write
 * the exact same state. React code reaches it through this file's two
 * Contexts (state via useBackfillStatus(), stable functions via
 * useBackfillStatusActions()); index.page.js has no Context access, so it
 * still goes through the `window.*` bridges the Provider publishes - see
 * that Provider's own comment.
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

// Window-bridge elimination Phase 4 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// the same "ancestor pushing down into its own descendant through window"
// pattern as the button state, for the Backfill tab's status badges, details
// text and log text - all written only by this Provider's own status render
// (and, for the log, one vanilla line in index.page.js), so they're owned
// here and AppRoot reads them back out. `backfillLogUpdateTick` bumps on
// *every* log write, even identical text: BackfillLogControls' scroll-sync
// effect has to fire on every refresh, and useState bails out of a
// same-value update.
export const DEFAULT_BACKFILL_BADGES = { badges: [] };
export const DEFAULT_BACKFILL_DETAILS_TEXT = 'Loading backfill status...';
export const DEFAULT_BACKFILL_LOG_TEXT = 'Loading backfill log...';

// Reactive *state* - changes as the backfill's status does. Anything that
// only needs the functions below should use BackfillStatusActionsContext
// instead, so it doesn't re-render on every status/log update.
export const BackfillStatusContext = createContext({
  backfillButtonState: DEFAULT_BACKFILL_BUTTON_STATE,
  backfillBadges: DEFAULT_BACKFILL_BADGES,
  backfillDetailsText: DEFAULT_BACKFILL_DETAILS_TEXT,
  backfillLogText: DEFAULT_BACKFILL_LOG_TEXT,
  backfillLogUpdateTick: 0,
  isBackfillRunning: false,
  isBackfillActionPending: false,
  supportsBackfillLogPolling: true,
});

export function useBackfillStatus() {
  return useContext(BackfillStatusContext);
}

/**
 * The Provider's functions, in their own Context with a stable identity for
 * the Provider's lifetime (they read refs and call useState setters, never
 * close over render state). Separate from BackfillStatusContext above on
 * purpose: PrDataProvider wraps the whole table tree and needs
 * getBackfillTrackingState for its poll, so subscribing it to the changing
 * state value would re-render every usePrData() consumer on each backfill
 * log update (same trap as AutoRenderBlockingActionsContext).
 *
 * `getBackfillTrackingState` reads refs, so a caller holding it across an
 * async flow still sees a setter's write immediately - the synchronous-read
 * semantics the old module `let`s (and window.getBackfillTrackingState) had.
 */
export const BackfillStatusActionsContext = createContext({
  getBackfillTrackingState: () => ({
    supportsBackfillLogPolling: true,
    isBackfillRunning: false,
    isBackfillActionPending: false,
  }),
  setBackfillButtonState: () => {},
  setIsBackfillActionPending: () => {},
  setSupportsBackfillLogPolling: () => {},
  updateBackfillStatusFromPayload: () => {},
  renderBackfillStatus: () => {},
  setBackfillLogMessage: () => {},
});

export function useBackfillStatusActions() {
  return useContext(BackfillStatusActionsContext);
}
