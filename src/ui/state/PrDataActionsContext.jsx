import { createContext, useContext } from 'react';

/**
 * Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * the PR-data pipeline that used to live in index.page.js and reach React
 * through window.loadStoredData/applyFreshPrPayload/applyLatestPrData/
 * getLatestStoredPayload, now owned by <PrDataProvider />.
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
 * this app - the same inert fallback these hooks had when they read
 * `window.loadStoredData?.()` before the Provider mounted.
 */
export const PrDataActionsContext = createContext({
  loadStoredData: async () => null,
  applyFreshPrPayload: () => {},
  applyLatestPrData: () => {},
  getLatestStoredPayload: () => null,
});

export function usePrDataActions() {
  return useContext(PrDataActionsContext);
}
