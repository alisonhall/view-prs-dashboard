import { createContext, useContext } from 'react';

/**
 * Window-bridge elimination Phase 3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
 * `beginRequestActivity`/`renderRequestActivity`, published (since Phase 7.3)
 * by <RequestActivityProvider />.
 *
 * Its own Context rather than another field of `usePrData()`, on purpose:
 * the writers that call these (useRunScript/useAckLabelActions/
 * useBackfillActions/useRequestMoreMerged, all called from AppRoot's body)
 * would otherwise subscribe to the whole PR-data value, which changes on
 * every payload/repo/stats update - re-rendering AppRoot and every portal it
 * builds each time. These functions never change, so this Context's value
 * never does either.
 *
 * Window-bridge elimination Phase 7.3: also `renderSchedulerStatus(scheduler)`
 * (was index.page.js's, reached as window.renderSchedulerStatus), which
 * records the scheduler state the "Auto run" badge reads and announces the
 * scheduler's active PRs to the table.
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context in
 * this app - the same inert fallback these hooks had when they read
 * `window.beginRequestActivity || noop`.
 */
export const RequestActivityContext = createContext({
  beginRequestActivity: () => () => {},
  renderRequestActivity: () => {},
  renderSchedulerStatus: () => {},
});

export function useRequestActivity() {
  return useContext(RequestActivityContext);
}

/**
 * Window-bridge elimination Phase 7.3: what the activity drawer displays - the
 * current request-activity badges and the recent finished requests. AppRoot
 * used to hold these as its own state, pushed in by PrDataProvider through
 * window.updateReactRequestActivityBadges/updateReactRecentRequestActivity (an
 * ancestor writing down into its descendant). Separate from the functions
 * above because this changes on every activity tick: only its readers
 * re-render, never the many callers of the stable functions.
 */
export const RequestActivityDisplayContext = createContext({
  requestActivityBadges: [],
  recentRequestActivity: [],
});

export function useRequestActivityDisplay() {
  return useContext(RequestActivityDisplayContext);
}
