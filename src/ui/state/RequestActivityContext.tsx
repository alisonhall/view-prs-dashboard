import { createContext, useContext } from 'react';
import type { SchedulerSnapshot } from '../helpers/pr-job-events.helpers.ts';

/**
 * Request activity, published by <RequestActivityProvider />:
 * `beginRequestActivity(key)` starts tracking an in-flight request (and
 * returns the function that ends it), `renderRequestActivity()` publishes
 * the requests in flight again, and `renderSchedulerStatus(scheduler)`
 * announces the scheduler's active PRs to the table.
 *
 * Its own Context rather than another field of `usePrData()`, on purpose:
 * the writers that call these (useRunScript/useAckLabelActions/
 * useBackfillActions, called high in the tree: AppShell
 * and the Settings drawer's sections) would otherwise subscribe to the whole
 * PR-data value, which changes on every payload/repo/stats update -
 * re-rendering them and everything under them each time. These functions never change, so this Context's value
 * never does either.
 *
 * Default value (unwrapped) is a safe no-op, matching every other Context in
 * this app.
 */

// The request kinds RequestActivityProvider counts and labels. Other keys
// are ignored for counting but still listed under recent activity.
export type RequestActivityKey =
  | 'runScript'
  | 'ackClear'
  | 'singlePr'
  | 'dataLoad'
  | 'olderMerged'
  | 'backfill'
  | 'labelApply'
  | 'checkboxToggle'
  | 'notesSave'
  | 'threadCheck'
  | 'authorComment';

export interface RequestActivityValue {
  // Typed as string (not RequestActivityKey) because the helpers that take
  // it as a dependency accept any key.
  beginRequestActivity: (key: string) => () => void;
  renderRequestActivity: () => void;
  renderSchedulerStatus: (scheduler?: SchedulerSnapshot & { activePrNumbers?: unknown[] }) => void;
}

export const RequestActivityContext = createContext<RequestActivityValue>({
  beginRequestActivity: () => () => {},
  renderRequestActivity: () => {},
  renderSchedulerStatus: () => {},
});

export function useRequestActivity(): RequestActivityValue {
  return useContext(RequestActivityContext);
}

/**
 * What the activity popover displays - the requests in flight from this
 * tab and the recent finished ones. Separate from the functions above
 * because this changes on every request: only its readers re-render,
 * never the many callers of the stable functions.
 */
export interface RecentRequestActivity {
  key: string;
  label: string;
  finishedAt: string;
}

// When a request has run long enough to warn, then to look stuck.
export interface RequestActivityThresholds {
  warnMs: number;
  criticalMs: number;
}

// One kind of request in flight: how many, and since when (the oldest).
export interface ActiveRequestActivity {
  key: string;
  label: string;
  count: number;
  startedAtMs: number;
  thresholds: RequestActivityThresholds;
}

export interface RequestActivityDisplayValue {
  activeRequests: ActiveRequestActivity[];
  recentRequestActivity: RecentRequestActivity[];
}

export const RequestActivityDisplayContext = createContext<RequestActivityDisplayValue>({
  activeRequests: [],
  recentRequestActivity: [],
});

export function useRequestActivityDisplay(): RequestActivityDisplayValue {
  return useContext(RequestActivityDisplayContext);
}
