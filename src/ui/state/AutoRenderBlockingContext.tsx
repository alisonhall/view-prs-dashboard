import { createContext, useContext } from 'react';
import type { AutoRenderBlockingState } from '../helpers/pr-auto-render-state.helpers.ts';
import type { PrDataPayload } from '../types/pr-data.ts';

/**
 * The auto-render-blocking decision: whether an incoming background-poll
 * payload can be applied now, must wait for a focused text field to blur,
 * or must wait for the user's unsaved edits to clear.
 *
 * The blocking state (which PRs/authors have unsaved edits) is computed by
 * `AutoRenderBlockingSync.jsx` from `NotesDirtyContext` and the drafts
 * Context, and pushed in through the actions Context's `setBlockingState`.
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context
 * in this app.
 */
export interface AutoRenderBlockingValue {
  isBlocked: boolean;
  statusText: string;
  discardAndApply: () => void;
  // Feed the "jump to unsaved" links (AutoRenderBlockedLinks.jsx).
  blockingPrNumbers: string[];
  blockingAuthorInsightsLogins: string[];
  blockingPrLabel: string;
}

export const AutoRenderBlockingContext = createContext<AutoRenderBlockingValue>({
  isBlocked: false,
  statusText: '',
  discardAndApply: () => {},
  blockingPrNumbers: [],
  blockingAuthorInsightsLogins: [],
  blockingPrLabel: '',
});

/**
 * PrDataProvider's polling reads/writes the pending payload through these,
 * registers its applyFreshPrPayload with `setFreshPayloadApplier` (this
 * Provider calls it to apply a pending payload), and AutoRenderBlockingSync
 * pushes the computed blocking state with `setBlockingState`.
 *
 * A separate Context from AutoRenderBlockingContext above, on purpose: that
 * one's value changes whenever blocking state does (isBlocked/statusText),
 * which happens on edits in the PR table. PrDataProvider (which wraps the
 * whole table tree) must not subscribe to that, or each such event
 * re-renders every usePrData() consumer. This object has a stable identity
 * for the Provider's lifetime (the functions read the Provider's ref, never
 * render state), so it never re-renders anything.
 */
export interface AutoRenderBlockingActionsValue {
  getHasDirtyPrSectionsFields: () => boolean;
  getPendingAutoRenderPayload: () => PrDataPayload | null;
  setPendingAutoRenderPayload: (payload: PrDataPayload | null) => void;
  setFreshPayloadApplier: (applier: ((payload: PrDataPayload) => void) | null | undefined) => void;
  setBlockingState: (state: AutoRenderBlockingState | null | undefined) => void;
}

export const AutoRenderBlockingActionsContext = createContext<AutoRenderBlockingActionsValue>({
  getHasDirtyPrSectionsFields: () => false,
  getPendingAutoRenderPayload: () => null,
  setPendingAutoRenderPayload: () => {},
  setFreshPayloadApplier: () => {},
  setBlockingState: () => {},
});

export function useAutoRenderBlockingActions(): AutoRenderBlockingActionsValue {
  return useContext(AutoRenderBlockingActionsContext);
}

export function useAutoRenderBlocking(): AutoRenderBlockingValue {
  return useContext(AutoRenderBlockingContext);
}
