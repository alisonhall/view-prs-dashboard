import { createContext, useContext } from 'react';
import type { BackfillBadge, BackfillButtonState, BackfillStatus } from '../helpers/pr-backfill.helpers.ts';

/**
 * The backfill tracking flags (`isBackfillRunning`/`isBackfillActionPending`/
 * `supportsBackfillLogPolling`) and the Backfill section's display state, owned
 * by BackfillStatusProvider.tsx. Everything reaches it through this file's
 * two Contexts: state via useBackfillStatus(), stable functions via
 * useBackfillStatusActions().
 *
 * Default value (unwrapped) is a safe no-op shape, matching every other
 * Context in this app.
 */
// How many log lines a status/log load asks for. Shared by the Provider's
// own loadBackfillStatus and useBackfillActions.tsx's factory instance.
export const BACKFILL_LOG_TAIL_LINES = 120;

// The Backfill section's 4 button-disabled flags. Matches
// the static markup's initial state (no button starts out disabled).
export const DEFAULT_BACKFILL_BUTTON_STATE: BackfillButtonState = {
  startDisabled: false,
  stopDisabled: false,
  refreshDisabled: false,
  refreshLogDisabled: false,
};

// The status badges, details text and log text, written only by the
// Provider's status render and log loads; AppRoot reads them.
// `backfillLogUpdateTick` bumps on *every* log write, even identical text:
// BackfillLog's scroll-sync effect has to fire on every refresh, and
// useState bails out of a same-value update.
export const DEFAULT_BACKFILL_BADGES: { badges: BackfillBadge[] } = { badges: [] };
export const DEFAULT_BACKFILL_DETAILS_TEXT = 'Loading backfill status...';
export const DEFAULT_BACKFILL_LOG_TEXT = 'Loading backfill log...';

export interface BackfillTrackingState {
  supportsBackfillLogPolling: boolean;
  isBackfillRunning: boolean;
  isBackfillActionPending: boolean;
}

export interface BackfillStatusValue extends BackfillTrackingState {
  backfillButtonState: BackfillButtonState;
  backfillBadges: { badges: BackfillBadge[] };
  backfillDetailsText: string;
  backfillLogText: string;
  backfillLogUpdateTick: number;
}

// Reactive *state* - changes as the backfill's status does. Anything that
// only needs the functions below should use BackfillStatusActionsContext
// instead, so it doesn't re-render on every status/log update.
export const BackfillStatusContext = createContext<BackfillStatusValue>({
  backfillButtonState: DEFAULT_BACKFILL_BUTTON_STATE,
  backfillBadges: DEFAULT_BACKFILL_BADGES,
  backfillDetailsText: DEFAULT_BACKFILL_DETAILS_TEXT,
  backfillLogText: DEFAULT_BACKFILL_LOG_TEXT,
  backfillLogUpdateTick: 0,
  isBackfillRunning: false,
  isBackfillActionPending: false,
  supportsBackfillLogPolling: true,
});

export function useBackfillStatus(): BackfillStatusValue {
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
 * async flow still sees a setter's write immediately.
 *
 * `loadBackfillStatus({ announce, includeLog })` fetches the status (and
 * optionally the log tail) and renders it here; PrDataProvider's backfill
 * poll calls it.
 */
export interface BackfillStatusActionsValue {
  // Resolves to the status (null from the unwrapped default).
  loadBackfillStatus: (options?: { announce?: boolean; includeLog?: boolean }) => Promise<BackfillStatus | null>;
  getBackfillTrackingState: () => BackfillTrackingState;
  // A falsy value resets to the default.
  setBackfillButtonState: (state: BackfillButtonState | null | undefined) => void;
  setIsBackfillActionPending: (pending: boolean) => void;
  setSupportsBackfillLogPolling: (supported: boolean) => void;
  // Takes the backfill status itself, or a data payload carrying it as
  // `backfill`.
  updateBackfillStatusFromPayload: (
    payload?: (BackfillStatus & { backfill?: BackfillStatus }) | null,
    options?: { announce?: boolean },
  ) => void;
  renderBackfillStatus: (backfill?: BackfillStatus | null) => void;
  setBackfillLogMessage: (message: string) => void;
}

export const BackfillStatusActionsContext = createContext<BackfillStatusActionsValue>({
  loadBackfillStatus: async () => null,
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

export function useBackfillStatusActions(): BackfillStatusActionsValue {
  return useContext(BackfillStatusActionsContext);
}
