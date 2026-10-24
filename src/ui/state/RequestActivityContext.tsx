import { createContext, useContext } from 'react';
import type { ActivityBadge } from '../helpers/pr-activity-badges.helpers.ts';
import type { SchedulerSnapshot } from '../helpers/pr-job-events.helpers.ts';

/**
 * Request activity, published by <RequestActivityProvider />:
 * `beginRequestActivity(key)` starts tracking an in-flight request (and
 * returns the function that ends it), `renderRequestActivity()` refreshes
 * the badges, and `renderSchedulerStatus(scheduler)` records the scheduler
 * state the "Auto run" badge reads and announces the scheduler's active PRs
 * to the table.
 *
 * Its own Context rather than another field of `usePrData()`, on purpose:
 * the writers that call these (useRunScript/useAckLabelActions/
 * useBackfillActions/useRequestMoreMerged, all called from AppRoot's body)
 * would otherwise subscribe to the whole PR-data value, which changes on
 * every payload/repo/stats update - re-rendering AppRoot and every portal it
 * builds each time. These functions never change, so this Context's value
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
  | 'backfill'
  | 'labelApply'
  | 'checkboxToggle'
  | 'notesSave'
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
 * What the activity drawer displays - the current request-activity badges
 * and the recent finished requests. Separate from the functions above
 * because this changes on every activity tick: only its readers re-render,
 * never the many callers of the stable functions.
 */
export interface RecentRequestActivity {
  key: string;
  label: string;
  finishedAt: string;
}

export interface RequestActivityDisplayValue {
  requestActivityBadges: ActivityBadge[];
  recentRequestActivity: RecentRequestActivity[];
}

export const RequestActivityDisplayContext = createContext<RequestActivityDisplayValue>({
  requestActivityBadges: [],
  recentRequestActivity: [],
});

export function useRequestActivityDisplay(): RequestActivityDisplayValue {
  return useContext(RequestActivityDisplayContext);
}
