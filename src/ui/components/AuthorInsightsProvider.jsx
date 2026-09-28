import { useMemo } from 'react';
import { AuthorInsightsContext } from '../state/AuthorInsightsContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { usePrData } from '../state/PrDataContext';
import { createPrAuthorInsightsIdentityHelpers } from '../helpers/pr-author-insights-identity.helpers.js';
import { createPrAuthorInsightsDisplayHelpers } from '../helpers/pr-author-insights-display.helpers.js';
import { createPrAuthorInsightsDraftsHelpers } from '../helpers/pr-author-insights-drafts.helpers.js';
import { createPrAuthorInsightsDataHelpers } from '../helpers/pr-author-insights-data.helpers.js';
import { createPrReviewStatsAggregationHelpers } from '../helpers/pr-review-stats-aggregation.helpers.js';
import { createPrStatusDisplayHelpers } from '../helpers/pr-status-display.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { parseSortableTime } from '../helpers/pr-sortable-time.helpers.js';

const { isChangedStatus } = createPrStatusDisplayHelpers();
const { toCount, formatIsoDatetime } = createPrFormattingHelpers();
const { normalizeRowMetrics } = createPrReviewStatsAggregationHelpers();
const { normalizeAuthorInsightsSentiment, DEFAULT_AUTHOR_INSIGHTS_SENTIMENT } = createPrAuthorInsightsDraftsHelpers();
const { AUTHOR_COMMENT_SENTIMENT_OPTIONS } = createPrAuthorInsightsDataHelpers();
const asArray = (value) => (Array.isArray(value) ? value : []);

// These only close over the module-level constants above - never
// `payload` or actor identity - so they're built once here, not inside
// the component's own useMemo. Bundling them into that per-render memo
// used to give them a fresh reference every time `payload` changed (e.g.
// on every poll tick), which silently retriggered any effect keying on
// one of them - concretely, AuthorInsightsCommentsSection's per-author
// refresh effect includes sortAuthorInsightsManualCommentsDesc in its
// deps (react-hooks/exhaustive-deps requires it), so an unrelated poll
// landing while a comment was being edited reset editingCommentId to
// null, silently closing the edit form.
const stableDisplay = createPrAuthorInsightsDisplayHelpers({
  normalizeAuthorInsightsSentiment,
  isChangedStatus,
  asArray,
  parseSortableTime,
  formatIsoDatetime,
});

const getOpenConversationCount = (row) => {
  const openConversationCountRaw = row?.openConversationCount;
  const metrics = normalizeRowMetrics(row);
  const fallbackOpenConversations =
    metrics.conversationSummary.estimatedOpenConversations ||
    metrics.counts.openConversations ||
    metrics.conversationSummary.openThreads;

  return Number.isFinite(Number(openConversationCountRaw))
    ? Number(openConversationCountRaw)
    : toCount(fallbackOpenConversations);
};

const stableValue = {
  getAuthorInsightsSentimentLabel: stableDisplay.getAuthorInsightsSentimentLabel,
  getAuthorInsightsSentimentBadgeClassName: stableDisplay.getAuthorInsightsSentimentBadgeClassName,
  getAuthorInsightsStatusBadgeClassName: stableDisplay.getAuthorInsightsStatusBadgeClassName,
  getAuthorInsightsCreatedPrStatus: stableDisplay.getAuthorInsightsCreatedPrStatus,
  sortAuthorInsightsCreatedPrsDesc: stableDisplay.sortAuthorInsightsCreatedPrsDesc,
  sortAuthorInsightsNoteMatchesDesc: stableDisplay.sortAuthorInsightsNoteMatchesDesc,
  sortAuthorInsightsManualCommentsDesc: stableDisplay.sortAuthorInsightsManualCommentsDesc,
  getAuthorInsightsNoteDisplayTimestamp: stableDisplay.getAuthorInsightsNoteDisplayTimestamp,
  normalizeAuthorInsightsSentiment,
  DEFAULT_AUTHOR_INSIGHTS_SENTIMENT,
  AUTHOR_COMMENT_SENTIMENT_OPTIONS,
  getOpenConversationCount,
  parseSortableTime,
};

/**
 * Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md, and
 * state/AuthorInsightsContext.jsx's own comment): derives the Author
 * Insights tab's display/formatting/sorting functions straight from
 * PrDataContext's payload.actorsMap + ActorIdentityContext, replacing the
 * window.* bridges index.page.js used to assign for this cluster.
 *
 * Only getAuthorInsightsDisplayName/noteAuthorMatchesSelection/
 * buildAuthorInsightsEntries genuinely need payload/actor identity -
 * everything else comes from the module-level stableValue above (see its
 * own comment for why that split matters).
 *
 * Must be mounted inside both <PrDataProvider> and the
 * <ActorIdentityContext.Provider> it sets up - see react-app.jsx's AppRoot
 * for the actual nesting.
 */
export function AuthorInsightsProvider({ children }) {
  const { payload } = usePrData();
  const { normalizeActorLogin, resolveActorDisplayName, getPreferredActorKey } = useActorIdentity();

  const value = useMemo(() => {
    const getLatestActorsMap = () => payload?.actorsMap || {};

    const { getAuthorInsightsDisplayName, noteAuthorMatchesSelection } = createPrAuthorInsightsIdentityHelpers({
      normalizeActorLogin,
      resolveActorDisplayName,
      getLatestActorsMap,
    });

    const { buildAuthorInsightsEntries } = createPrAuthorInsightsDisplayHelpers({
      resolveActorDisplayName,
      getPreferredActorKey,
      normalizeActorLogin,
    });

    return {
      ...stableValue,
      getAuthorInsightsDisplayName,
      noteAuthorMatchesSelection,
      buildAuthorInsightsEntries,
    };
  }, [payload, normalizeActorLogin, resolveActorDisplayName, getPreferredActorKey]);

  return <AuthorInsightsContext.Provider value={value}>{children}</AuthorInsightsContext.Provider>;
}
