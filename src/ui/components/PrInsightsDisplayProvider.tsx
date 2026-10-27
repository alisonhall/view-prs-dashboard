import { useMemo, type ReactNode } from 'react';
import { PrInsightsDisplayContext, type PrInsightsDisplayValue } from '../state/PrInsightsDisplayContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { createPrRequestedReviewersHelpers } from '../helpers/pr-requested-reviewers.helpers.ts';
import { createPrAssignedUsersHelpers } from '../helpers/pr-assigned-users.helpers.ts';
import { createPrApproversHelpers } from '../helpers/pr-approvers.helpers.ts';
import { createPrInsightMetricsSummaryHelpers } from '../helpers/pr-insight-metrics-summary.helpers.ts';
import { createPrUiRenderUtilsHelpers } from '../helpers/pr-ui-render-utils.helpers.ts';
import { createPrReviewStatsAggregationHelpers } from '../helpers/pr-review-stats-aggregation.helpers.ts';
import { createPrNotesHelpers } from '../helpers/pr-notes.helpers.ts';
import { createPrMarkdownRenderHelpers } from '../helpers/pr-markdown-render.helpers.ts';
import { createPrActivityEventsHelpers } from '../helpers/pr-activity-events.helpers.ts';
import { createPrApprovalDurationHelpers } from '../helpers/pr-approval-duration.helpers.ts';
import { createPrViewedFilesSummaryHelpers } from '../helpers/pr-viewed-files-summary.helpers.ts';
import { createPrOpenConversationCountHelpers } from '../helpers/pr-open-conversation-count.helpers.ts';
import { createPrNotesPeopleOptionsHelpers } from '../helpers/pr-notes-people-options.helpers.ts';
import { createPrUserInitialsHelpers } from '../helpers/pr-user-initials.helpers.ts';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';
import { asArray } from '../helpers/pr-as-array.helpers.ts';

const { toCount, formatIsoDatetime } = createPrFormattingHelpers();

// These only close over the module-level constants above - never actor/
// viewer identity - so they're built once here, not inside the
// component's own useMemo. Bundling them into that per-render memo would
// give them a fresh reference every time the identity functions changed
// (e.g. on every poll tick, since ActorIdentityContext's value is itself
// payload-derived), the same stale-dependency-array risk
// AuthorInsightsProvider.tsx's own comment documents and was fixed for.
const {
  formatReviewFootprint,
  formatConversationStatus,
  formatApprovalRisk,
  formatCommentUsefulness,
} = createPrInsightMetricsSummaryHelpers();
const { parseMarkerState } = createPrUiRenderUtilsHelpers();
const { normalizeRowMetrics } = createPrReviewStatsAggregationHelpers();
const { normalizeStoriesForUi } = createPrNotesHelpers();
const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();
const { buildActivityEventKey, normalizePrRootUrl, buildFallbackActivityEvents, buildActivityEvents } =
  createPrActivityEventsHelpers({ asArray });
const { formatDurationMinutes } = createPrApprovalDurationHelpers({ toCount });
const { getViewedFilesSummary } = createPrViewedFilesSummaryHelpers({ toCount });
const { getOpenConversationCount } = createPrOpenConversationCountHelpers({ asArray });
const { getUserInitials } = createPrUserInitialsHelpers();

const stableValue = {
  parseMarkerState,
  normalizeRowMetrics,
  getOpenConversationCount,
  getUserInitials,
  getViewedFilesSummary,
  formatReviewFootprint,
  formatConversationStatus,
  formatApprovalRisk,
  formatCommentUsefulness,
  formatDurationMinutes,
  buildFallbackActivityEvents,
  buildActivityEventKey,
  buildActivityEvents,
  normalizePrRootUrl,
  normalizeStoriesForUi,
  renderMarkdownAsHtml,
};

/**
 * Derives the row insights' formatting/badge-class functions
 * (see state/PrInsightsDisplayContext.tsx).
 *
 * Only formatApproversDisplay/formatRequestedReviewersDisplay/
 * formatAssignedUsersDisplay/buildPrPeopleOptions/
 * getOpenConversationCountWithMe genuinely need actor/viewer identity -
 * everything else comes from the module-level stableValue above (see its
 * own comment for why that split matters).
 *
 * Must be mounted inside the <ActorIdentityContext.Provider> PrDataProvider
 * sets up - see AppShell's PrTable for the actual nesting. Doesn't need
 * usePrData() itself - every consumer already receives `row`/`actorsMap`
 * as props and passes them as plain arguments into these functions.
 */
export function PrInsightsDisplayProvider({ children }: { children?: ReactNode }) {
  const { normalizeActorLogin, resolveActorDisplayName, getPreferredActorKey, getEffectiveViewerLogin } =
    useActorIdentity();

  const value = useMemo<PrInsightsDisplayValue>(() => {
    const { collectRequestedReviewers, formatRequestedReviewersDisplay } = createPrRequestedReviewersHelpers({
      asArray,
      resolveActorDisplayName,
    });
    const { collectAssignedUsers, formatAssignedUsersDisplay } = createPrAssignedUsersHelpers({
      asArray,
      normalizeActorLogin,
      resolveActorDisplayName,
    });
    const { formatApproversDisplay } = createPrApproversHelpers({
      asArray,
      getPreferredActorKey,
      resolveActorDisplayName,
      formatIsoDatetime,
    });
    const { buildPrPeopleOptions } = createPrNotesPeopleOptionsHelpers({
      resolveActorDisplayName,
      asArray,
    });
    const { getOpenConversationCountWithMe } = createPrOpenConversationCountHelpers({
      getEffectiveViewerLogin,
      asArray,
    });

    return {
      ...stableValue,
      formatApproversDisplay,
      formatRequestedReviewersDisplay,
      collectRequestedReviewers,
      formatAssignedUsersDisplay,
      collectAssignedUsers,
      buildPrPeopleOptions,
      getOpenConversationCountWithMe,
    };
  }, [normalizeActorLogin, resolveActorDisplayName, getPreferredActorKey, getEffectiveViewerLogin]);

  return <PrInsightsDisplayContext.Provider value={value}>{children}</PrInsightsDisplayContext.Provider>;
}
