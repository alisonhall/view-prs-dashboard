import { createContext, useContext } from 'react';

/**
 * Activity drawer feature (see REACT_MIGRATION_PLAN.md): the busy/queued
 * PR-number Sets that used to live locally inside PrTableApp.jsx, lifted
 * here so the drawer's bulk-action queue section (a sibling portal, not a
 * descendant of PrTableApp) can read the same state. Viable now that
 * react-app.jsx is a single root with portaled sections (confirmed before
 * this lift - see the plan's Context note) rather than the independent
 * per-section roots an earlier draft of this plan assumed.
 *
 * Default value (unwrapped) is a safe empty/no-op shape, matching every
 * other Context in this app.
 */
export const PrActivityQueueContext = createContext({
  busyPrNumbers: new Set(),
  queuedPrNumbers: new Set(),
  markPrBusy: () => {},
  clearPrBusy: () => {},
  markPrQueued: () => {},
  clearPrQueued: () => {},
  bulkBatches: [],
});

export function usePrActivityQueue() {
  return useContext(PrActivityQueueContext);
}
