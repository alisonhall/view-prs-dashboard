import { useMemo } from 'react';
import { PrInsightsDisplayContext } from '../state/PrInsightsDisplayContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
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
import { createPrStatusDisplayHelpers } from '../helpers/pr-status-display.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';

const { isChangedStatus } = createPrStatusDisplayHelpers();
const { toCount, formatIsoDatetime } = createPrFormattingHelpers();
const asArray = (value) => (Array.isArray(value) ? value : []);

// These only close over the module-level constants above - never actor/
// viewer identity - so they're built once here, not inside the
// component's own useMemo. Bundling them into that per-render memo would
// give them a fresh reference every time the identity functions changed
// (e.g. on every poll tick, since ActorIdentityContext's value is itself
// payload-derived), the same stale-dependency-array risk
// AuthorInsightsProvider.jsx's own comment documents and was fixed for.
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
const { getOpenConversationCount } = createPrOpenConversationCountHelpers({ asArray });

const stableValue = {
  parseMarkerState,
  normalizeRowMetrics,
  getOpenConversationCount,
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
  normalizeNotesListForUi,
  renderMarkdownAsHtml,
};

/**
 * Phase 7 (see REACT_MIGRATION_PLAN.md, and
 * state/PrInsightsDisplayContext.jsx's own comment): derives the "More
 * insights" panel's formatting/badge-class functions, replacing the
 * window.* bridges index.page.js used to assign for this cluster.
 *
 * Only formatApproversDisplay/formatRequestedReviewersDisplay/
 * formatAssignedUsersDisplay/buildPrPeopleOptions/
 * getOpenConversationCountWithMe genuinely need actor/viewer identity -
 * everything else comes from the module-level stableValue above (see its
 * own comment for why that split matters).
 *
 * Must be mounted inside the <ActorIdentityContext.Provider> PrDataProvider
 * sets up - see react-app.jsx for the actual nesting. Doesn't need
 * usePrData() itself - every consumer already receives `row`/`actorsMap`
 * as props and passes them as plain arguments into these functions.
 */
export function PrInsightsDisplayProvider({ children }) {
  const { normalizeActorLogin, resolveActorDisplayName, getPreferredActorKey, getEffectiveViewerLogin } =
    useActorIdentity();

  const value = useMemo(() => {
    const { formatRequestedReviewersDisplay } = createPrRequestedReviewersHelpers({
      asArray,
      resolveActorDisplayName,
    });
    const { formatAssignedUsersDisplay } = createPrAssignedUsersHelpers({
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
      formatAssignedUsersDisplay,
      buildPrPeopleOptions,
      getOpenConversationCountWithMe,
    };
  }, [normalizeActorLogin, resolveActorDisplayName, getPreferredActorKey, getEffectiveViewerLogin]);

  return <PrInsightsDisplayContext.Provider value={value}>{children}</PrInsightsDisplayContext.Provider>;
}
