import { createContext, useContext } from 'react';
import { createPrRequestedReviewersHelpers } from '../helpers/pr-requested-reviewers.helpers.js';
import { createPrAssignedUsersHelpers } from '../helpers/pr-assigned-users.helpers.js';
import { createPrApproversHelpers } from '../helpers/pr-approvers.helpers.js';
import { createPrInsightBadgeClassHelpers } from '../helpers/pr-insight-badge-class.helpers.js';
import { createPrInsightMetricsSummaryHelpers } from '../helpers/pr-insight-metrics-summary.helpers.js';
import { createPrUiRenderUtilsHelpers } from '../helpers/pr-ui-render-utils.helpers.js';
import { createPrReviewStatsAggregationHelpers } from '../helpers/pr-review-stats-aggregation.helpers.js';
import { createPrNotesHelpers } from '../helpers/pr-notes.helpers.js';
import { createPrMarkdownRenderHelpers } from '../helpers/pr-markdown-render.helpers.js';
import { createPrActivityEventsHelpers } from '../helpers/pr-activity-events.helpers.js';
import { createPrApprovalDurationHelpers } from '../helpers/pr-approval-duration.helpers.js';
import { createPrViewedFilesSummaryHelpers } from '../helpers/pr-viewed-files-summary.helpers.js';
import { createPrOpenConversationCountHelpers } from '../helpers/pr-open-conversation-count.helpers.js';
import { createPrNotesPeopleOptionsHelpers } from '../helpers/pr-notes-people-options.helpers.js';
import { createPrUserInitialsHelpers } from '../helpers/pr-user-initials.helpers.js';
import { createPrStatusDisplayHelpers } from '../helpers/pr-status-display.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { defaultActorIdentity } from './ActorIdentityContext';

const { isChangedStatus } = createPrStatusDisplayHelpers();
const { toCount } = createPrFormattingHelpers();
const asArray = (value) => (Array.isArray(value) ? value : []);
const {
  normalizeActorLogin,
  resolveActorDisplayName,
  getPreferredActorKey,
  getEffectiveViewerLogin,
} = defaultActorIdentity;

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md): the "More insights" expandable row
 * panel's formatting/badge-class functions (PrInsightsRow.jsx and
 * components/insights/*) used to live on ~18 window.* bridges assigned by
 * index.page.js. Most are genuinely zero-dependency (pure formatters); a
 * handful (formatApproversDisplay, formatRequestedReviewersDisplay,
 * formatAssignedUsersDisplay, buildPrPeopleOptions,
 * getOpenConversationCountWithMe) need actor/viewer identity, confirmed by
 * reading each body directly - not assumed from their names.
 *
 * Default value (factories called with defaultActorIdentity's own
 * zero-arg-equivalent functions) matches every consuming component's old
 * permissive `window.x || fallback` behavior, same "safe no-op when
 * unwrapped" shape as ActorIdentityContext/AuthorInsightsContext.
 *
 * getAuthorThreadResolutionPolicy/readReviewConversationsUiState/
 * writeReviewConversationsUiState are deliberately NOT part of this
 * Context - see REACT_MIGRATION_PLAN.md for why (a DOM-scan dependency and
 * a module-scope Map respectively, each a separate concern).
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
  const { getBadgeClassForStatus, getBadgeClassForCheck, getBadgeClassForMerge } =
    createPrInsightBadgeClassHelpers({ isChangedStatus });
  const {
    formatReviewFootprint,
    formatConversationStatus,
    formatApprovalRisk,
    formatCommentUsefulness,
  } = createPrInsightMetricsSummaryHelpers();
  const { parseMarkerState } = createPrUiRenderUtilsHelpers();
  const { normalizeRowMetrics } = createPrReviewStatsAggregationHelpers();
  const { normalizeNotesListForUi } = createPrNotesHelpers();
  const { renderMarkdownAsHtml } = createPrMarkdownRenderHelpers();
  const { buildActivityEventKey, normalizePrRootUrl, buildFallbackActivityEvents } =
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
    getBadgeClassForStatus,
    getBadgeClassForCheck,
    getBadgeClassForMerge,
    formatReviewFootprint,
    formatConversationStatus,
    formatApprovalRisk,
    formatCommentUsefulness,
    formatDurationMinutes,
    buildFallbackActivityEvents,
    buildActivityEventKey,
    normalizePrRootUrl,
    buildPrPeopleOptions,
    normalizeNotesListForUi,
    renderMarkdownAsHtml,
  };
};

export const defaultPrInsightsDisplay = buildDefaultPrInsightsDisplay();

export const PrInsightsDisplayContext = createContext(defaultPrInsightsDisplay);

export function usePrInsightsDisplay() {
  return useContext(PrInsightsDisplayContext);
}
