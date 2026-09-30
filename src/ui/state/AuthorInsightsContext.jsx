import { createContext, useContext } from 'react';
import { createPrAuthorInsightsIdentityHelpers } from '../helpers/pr-author-insights-identity.helpers.js';
import { createPrAuthorInsightsDisplayHelpers } from '../helpers/pr-author-insights-display.helpers.js';
import { createPrAuthorInsightsDraftsHelpers } from '../helpers/pr-author-insights-drafts.helpers.js';
import { createPrAuthorInsightsDataHelpers } from '../helpers/pr-author-insights-data.helpers.js';
import { createPrReviewStatsAggregationHelpers } from '../helpers/pr-review-stats-aggregation.helpers.js';
import { createPrStatusDisplayHelpers } from '../helpers/pr-status-display.helpers.js';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { parseSortableTime } from '../helpers/pr-sortable-time.helpers.js';
import { defaultActorIdentity } from './ActorIdentityContext';

const { toCount, formatIsoDatetime } = createPrFormattingHelpers();
const { isChangedStatus } = createPrStatusDisplayHelpers();
const asArray = (value) => (Array.isArray(value) ? value : []);
const { normalizeActorLogin, resolveActorDisplayName, getPreferredActorKey } = defaultActorIdentity;

/**
 * Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): the Author Insights
 * tab's display/formatting/sorting functions (getAuthorInsightsDisplayName,
 * noteAuthorMatchesSelection, buildAuthorInsightsEntries,
 * getAuthorInsightsSentimentLabel/BadgeClassName/StatusBadgeClassName/
 * CreatedPrStatus, the 3 sortAuthorInsightsXDesc functions,
 * getAuthorInsightsNoteDisplayTimestamp, normalizeAuthorInsightsSentiment,
 * getOpenConversationCount) used to live in index.page.js, reachable only
 * via window.* bridges. AuthorInsightsProvider
 * (components/AuthorInsightsProvider.jsx) derives all of it fresh from
 * PrDataContext's payload.actorsMap + ActorIdentityContext instead - none
 * of these actually need `authorInsightsState` itself (confirmed by
 * reading each helper module's own DI signature), only a "get the current
 * actors map" callback, which payload.actorsMap already satisfies.
 *
 * The manual-comment draft/cache CRUD functions (getAuthorInsightsComposerDraft,
 * updateAuthorInsightsEditDraft, getAuthorManualCommentsForLogin,
 * saveAuthorManualComment, etc.) - which DO need authorInsightsState, a
 * genuinely mutable per-author cache - are a separate, not-yet-migrated
 * concern; they stay on their existing window.* bridges for now (still
 * read by AuthorInsightsCommentsSection.jsx) rather than being
 * force-fitted into this Context.
 *
 * Default value (factories called with no arguments / an empty actors map)
 * matches every consuming component's old permissive `window.x || fallback`
 * behavior, so a component rendered without an <AuthorInsightsProvider>
 * ancestor still gets sane, actor-unaware behavior with no wrapping
 * required.
 */
const buildDefaultAuthorInsights = () => {
  const { normalizeAuthorInsightsSentiment, DEFAULT_AUTHOR_INSIGHTS_SENTIMENT } =
    createPrAuthorInsightsDraftsHelpers();
  const { AUTHOR_COMMENT_SENTIMENT_OPTIONS } = createPrAuthorInsightsDataHelpers();
  const { normalizeRowMetrics } = createPrReviewStatsAggregationHelpers();

  const identity = createPrAuthorInsightsIdentityHelpers({ normalizeActorLogin, resolveActorDisplayName });
  const display = createPrAuthorInsightsDisplayHelpers({
    resolveActorDisplayName,
    getPreferredActorKey,
    normalizeActorLogin,
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

  return {
    getAuthorInsightsDisplayName: identity.getAuthorInsightsDisplayName,
    noteAuthorMatchesSelection: identity.noteAuthorMatchesSelection,
    buildAuthorInsightsEntries: display.buildAuthorInsightsEntries,
    getAuthorInsightsSentimentLabel: display.getAuthorInsightsSentimentLabel,
    getAuthorInsightsSentimentBadgeClassName: display.getAuthorInsightsSentimentBadgeClassName,
    getAuthorInsightsStatusBadgeClassName: display.getAuthorInsightsStatusBadgeClassName,
    getAuthorInsightsCreatedPrStatus: display.getAuthorInsightsCreatedPrStatus,
    sortAuthorInsightsCreatedPrsDesc: display.sortAuthorInsightsCreatedPrsDesc,
    sortAuthorInsightsNoteMatchesDesc: display.sortAuthorInsightsNoteMatchesDesc,
    sortAuthorInsightsManualCommentsDesc: display.sortAuthorInsightsManualCommentsDesc,
    getAuthorInsightsNoteDisplayTimestamp: display.getAuthorInsightsNoteDisplayTimestamp,
    normalizeAuthorInsightsSentiment,
    DEFAULT_AUTHOR_INSIGHTS_SENTIMENT,
    AUTHOR_COMMENT_SENTIMENT_OPTIONS,
    getOpenConversationCount,
    parseSortableTime,
  };
};

export const defaultAuthorInsights = buildDefaultAuthorInsights();

export const AuthorInsightsContext = createContext(defaultAuthorInsights);

export function useAuthorInsights() {
  return useContext(AuthorInsightsContext);
}
