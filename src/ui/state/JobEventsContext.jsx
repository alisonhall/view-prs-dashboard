import { createContext, useContext } from 'react';
import { createPrJobEventsHelpers } from '../helpers/pr-job-events.helpers.js';

/**
 * Activity drawer feature (see REACT_MIGRATION_PLAN.md): the live,
 * SSE-pushed state of the three in-process background jobs (auto refresh,
 * quick check, merged/closed drain), owned by JobEventsProvider.jsx's
 * single EventSource connection to GET /view-prs/events.
 *
 * Default value (unwrapped) is a safe idle/disconnected snapshot, matching
 * every other Context in this app - a consumer rendered without a
 * <JobEventsProvider> ancestor just sees "connecting" and empty job state,
 * rather than throwing.
 */
const { getInitialJobEventsState } = createPrJobEventsHelpers();

export const JobEventsContext = createContext({
  ...getInitialJobEventsState(),
  isStale: false,
});

export function useJobEvents() {
  return useContext(JobEventsContext);
}
