import { createContext, useContext } from 'react';
import { createPrJobEventsHelpers, type JobEventsState } from '../helpers/pr-job-events.helpers.ts';

/**
 * The live, SSE-pushed state of the three in-process background jobs (auto
 * refresh, quick check, merged/closed drain), owned by JobEventsProvider's
 * single EventSource connection to GET /view-prs/events.
 *
 * Default value (unwrapped) is a safe idle/disconnected snapshot, matching
 * every other Context in this app - a consumer rendered without a
 * <JobEventsProvider> ancestor just sees "connecting" and empty job state,
 * rather than throwing.
 */
export interface JobEventsValue extends JobEventsState {
  // No event for over a minute (the watchdog checks every 30s).
  isStale: boolean;
}

const { getInitialJobEventsState } = createPrJobEventsHelpers();

export const JobEventsContext = createContext<JobEventsValue>({
  ...getInitialJobEventsState(),
  isStale: false,
});

export function useJobEvents(): JobEventsValue {
  return useContext(JobEventsContext);
}
