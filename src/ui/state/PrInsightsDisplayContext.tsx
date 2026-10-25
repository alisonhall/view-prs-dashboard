import { createContext, useContext } from 'react';
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
import { defaultActorIdentity } from './ActorIdentityContext';

const { toCount } = createPrFormattingHelpers();
const {
  normalizeActorLogin,
  resolveActorDisplayName,
  getPreferredActorKey,
  getEffectiveViewerLogin,
} = defaultActorIdentity;

/**
 * The PR insights' formatting functions (the detail pane, PrRowSummary.tsx
 * and components/insights/*). Most are pure formatters;
 * formatApproversDisplay, formatRequestedReviewersDisplay,
 * formatAssignedUsersDisplay, buildPrPeopleOptions and
 * getOpenConversationCountWithMe need actor/viewer identity, which
 * PrInsightsDisplayProvider supplies.
 *
 * Default value (factories called with defaultActorIdentity's functions)
 * is a safe fallback when unwrapped, like ActorIdentityContext's.
 *
 * The PR author thread-resolution allow/deny policy is deliberately not
 * here: ReviewThreadsSection.jsx's useAuthorThreadResolutionPolicy hook
 * builds it from AuthorThreadResolutionSelectionContext's selections.
 */
const buildDefaultPrInsightsDisplay = () => {
  const { collectRequestedReviewers, formatRequestedReviewersDisplay } = createPrRequestedReviewersHelpers({
    asArray,
    resolveActorDisplayName,
  });
  const { collectAssignedUsers, formatAssignedUsersDisplay } = createPrAssignedUsersHelpers({
    asArray,
    normalizeActorLogin,
    resolveActorDisplayName,
  });
  const { getUserInitials } = createPrUserInitialsHelpers();
  const { formatApproversDisplay } = createPrApproversHelpers({
    asArray,
    getPreferredActorKey,
    resolveActorDisplayName,
    formatIsoDatetime: createPrFormattingHelpers().formatIsoDatetime,
  });
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
  const { getOpenConversationCount, getOpenConversationCountWithMe } =
    createPrOpenConversationCountHelpers({ getEffectiveViewerLogin, asArray });
  const { buildPrPeopleOptions } = createPrNotesPeopleOptionsHelpers({
    resolveActorDisplayName,
    asArray,
  });

  return {
    parseMarkerState,
    formatApproversDisplay,
    formatRequestedReviewersDisplay,
    collectRequestedReviewers,
    formatAssignedUsersDisplay,
    collectAssignedUsers,
    getUserInitials,
    normalizeRowMetrics,
    getOpenConversationCount,
    getOpenConversationCountWithMe,
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
    buildPrPeopleOptions,
    normalizeStoriesForUi,
    renderMarkdownAsHtml,
  };
};

export const defaultPrInsightsDisplay = buildDefaultPrInsightsDisplay();

export type PrInsightsDisplayValue = ReturnType<typeof buildDefaultPrInsightsDisplay>;

export const PrInsightsDisplayContext = createContext<PrInsightsDisplayValue>(defaultPrInsightsDisplay);

export function usePrInsightsDisplay(): PrInsightsDisplayValue {
  return useContext(PrInsightsDisplayContext);
}
