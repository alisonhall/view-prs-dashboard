import { createContext, useContext } from 'react';
import { createPrAuthorInsightsIdentityHelpers } from '../helpers/pr-author-insights-identity.helpers.ts';
import { createPrAuthorInsightsDisplayHelpers } from '../helpers/pr-author-insights-display.helpers.ts';
import { createPrAuthorInsightsDraftsHelpers } from '../helpers/pr-author-insights-drafts.helpers.ts';
import { createPrAuthorInsightsDataHelpers } from '../helpers/pr-author-insights-data.helpers.ts';
import { createPrReviewStatsAggregationHelpers } from '../helpers/pr-review-stats-aggregation.helpers.ts';
import { createPrStatusDisplayHelpers } from '../helpers/pr-status-display.helpers.ts';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';
import { asArray } from '../helpers/pr-as-array.helpers.ts';
import { parseSortableTime } from '../helpers/pr-sortable-time.helpers.ts';
import type { PrData } from '../types/pr-data.ts';
import { defaultActorIdentity } from './ActorIdentityContext';

const { toCount, formatIsoDatetime } = createPrFormattingHelpers();
const { isChangedStatus } = createPrStatusDisplayHelpers();
const { normalizeRowMetrics } = createPrReviewStatsAggregationHelpers();
const { normalizeActorLogin, resolveActorDisplayName, getPreferredActorKey } = defaultActorIdentity;

// A PR's open conversation count: the row's own count when it has one,
// otherwise estimated from its metrics. Shared by the default value and
// AuthorInsightsProvider.
export const getOpenConversationCount = (row: PrData | null | undefined): number => {
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

/**
 * The Author Insights tab's display/formatting/sorting functions.
 * AuthorInsightsProvider (components/AuthorInsightsProvider.tsx) builds
 * them from PrDataContext's payload.actorsMap and ActorIdentityContext.
 *
 * The manual-comment drafts and comments cache are a separate concern,
 * owned by AuthorInsightsDraftsContext.
 *
 * Default value (factories called with defaultActorIdentity's functions
 * and an empty actors map) gives a component rendered without an
 * <AuthorInsightsProvider> ancestor sane, actor-unaware behavior.
 */
const buildDefaultAuthorInsights = () => {
  const { normalizeAuthorInsightsSentiment, DEFAULT_AUTHOR_INSIGHTS_SENTIMENT } =
    createPrAuthorInsightsDraftsHelpers();
  const { AUTHOR_COMMENT_SENTIMENT_OPTIONS } = createPrAuthorInsightsDataHelpers();

  const identity = createPrAuthorInsightsIdentityHelpers({ normalizeActorLogin, resolveActorDisplayName });
  const display = createPrAuthorInsightsDisplayHelpers({
    resolveActorDisplayName,
    getPreferredActorKey,
    normalizeAuthorInsightsSentiment,
    isChangedStatus,
    asArray,
    parseSortableTime,
    formatIsoDatetime,
  });

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

export type AuthorInsightsValue = ReturnType<typeof buildDefaultAuthorInsights>;

export const defaultAuthorInsights: AuthorInsightsValue = buildDefaultAuthorInsights();

export const AuthorInsightsContext = createContext<AuthorInsightsValue>(defaultAuthorInsights);

export function useAuthorInsights(): AuthorInsightsValue {
  return useContext(AuthorInsightsContext);
}
