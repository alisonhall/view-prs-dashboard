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
export const BackfillStatusContext = createContext({
  isBackfillRunning: false,
  isBackfillActionPending: false,
  supportsBackfillLogPolling: true,
  setIsBackfillActionPending: () => {},
  setSupportsBackfillLogPolling: () => {},
});

export function useBackfillStatus() {
  return useContext(BackfillStatusContext);
}
