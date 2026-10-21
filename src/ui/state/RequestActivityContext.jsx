import { createContext, useContext } from 'react';

/**
 * Window-bridge elimination Phase 3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * `beginRequestActivity`/`renderRequestActivity`, published by
 * <PrDataProvider /> (they're built once by its `activityHelpers` memo).
 *
 * Its own Context rather than another field of `usePrData()`, on purpose:
 * the writers that call these (useRunScript/useAckLabelActions/
 * useBackfillActions/useRequestMoreMerged, all called from AppRoot's body)
 * would otherwise subscribe to the whole PR-data value, which changes on
 * every payload/repo/stats update - re-rendering AppRoot and every portal it
 * builds each time. These two functions never change, so this Context's
 * value never does either.
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context in
 * this app - the same inert fallback these hooks had when they read
 * `window.beginRequestActivity || noop`.
 */
export const RequestActivityContext = createContext({
  beginRequestActivity: () => () => {},
  renderRequestActivity: () => {},
});

export function useRequestActivity() {
  return useContext(RequestActivityContext);
}
