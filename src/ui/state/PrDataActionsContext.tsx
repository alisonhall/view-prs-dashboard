import { createContext, useContext } from 'react';
import type { PrDataPayload } from '../types/pr-data.ts';

/**
 * The PR-data pipeline's actions, owned by <PrDataProvider />:
 *
 * - `loadStoredData(selectedRepo?)`: GET /view-prs/data and render it.
 * - `applyFreshPrPayload(payload, repo?)`: render a payload a caller already
 *   has in hand (POST responses, the auto-render-blocking apply/discard).
 * - `applyLatestPrData({ payload?, selectedRepo? })`: record the newest
 *   payload/repo without rendering (an optimistic local edit).
 * - `getLatestStoredPayload()`: the newest payload fetched, which can be
 *   ahead of the displayed one while auto-render is deferred.
 *
 * Its own Context rather than fields of `usePrData()`, for the same reason
 * as RequestActivityContext: the callers are mostly hooks in AppRoot's body,
 * and subscribing them to the whole PR-data value (which changes on every
 * payload/repo/stats update) would re-render AppRoot and every portal it
 * builds each time. The functions read the Provider's refs, so this value's
 * identity never changes.
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context in
 * this app.
 */
export interface PrDataActionsValue {
  loadStoredData: (selectedRepo?: string, options?: Record<string, unknown>) => Promise<PrDataPayload | null>;
  applyFreshPrPayload: (payload: PrDataPayload, repo?: string) => void;
  applyLatestPrData: (update?: { payload?: PrDataPayload | null; selectedRepo?: string }) => void;
  getLatestStoredPayload: () => PrDataPayload | null;
}

export const PrDataActionsContext = createContext<PrDataActionsValue>({
  loadStoredData: async () => null,
  applyFreshPrPayload: () => {},
  applyLatestPrData: () => {},
  getLatestStoredPayload: () => null,
});

export function usePrDataActions(): PrDataActionsValue {
  return useContext(PrDataActionsContext);
}
