import { createContext, useContext } from 'react';
import { createPrReviewStatsAggregationHelpers } from '../helpers/pr-review-stats-aggregation.helpers.ts';
import {
  createPrReviewStatsTimelineHelpers,
  type ReviewerTimeline,
} from '../helpers/pr-review-stats-timeline.helpers.ts';
import {
  createPrReviewStatsDateBucketingHelpers,
  type StatsDateRange,
} from '../helpers/pr-review-stats-date-bucketing.helpers.ts';
import type { PrEntry } from '../types/pr-data.ts';
import type { ActorsMap } from '../helpers/pr-actor-identity.helpers.ts';
import type { PrDataValue, ReviewStatsViewState } from './PrDataContext';

type AggregationHelpers = ReturnType<typeof createPrReviewStatsAggregationHelpers>;
type TimelineHelpers = ReturnType<typeof createPrReviewStatsTimelineHelpers>;
type DateBucketingHelpers = ReturnType<typeof createPrReviewStatsDateBucketingHelpers>;

/**
 * The Review Stats tab's settings (statsViewState: sort/filter/topN/
 * minComments/date range) and the aggregation functions that depend on
 * them. ReviewStatsProvider (components/ReviewStatsProvider.tsx) derives
 * the value from PrDataContext's statsViewState and ActorIdentityContext;
 * ReviewStatsControls/ReviewStatsContent/StatsVisuals/ReviewerActivityChart
 * read it here.
 *
 * Default value (factories called with no arguments, i.e. an empty
 * statsViewState) gives a component rendered without a
 * <ReviewStatsProvider> ancestor sane, settings-unaware behavior.
 */
export interface ReviewStatsValue {
  statsViewState: ReviewStatsViewState;
  setStatsViewState: PrDataValue['setStatsViewState'];
  normalizeRowMetrics: AggregationHelpers['normalizeRowMetrics'];
  buildReviewerStats: AggregationHelpers['buildReviewerStats'];
  applyStatsControls: AggregationHelpers['applyStatsControls'];
  getNormalizedStatsDateRange: () => StatsDateRange;
  renderActivityTrendNote: (rows: PrEntry[] | null | undefined, actorsMap?: ActorsMap) => string;
  bucketTimelineChartData: DateBucketingHelpers['bucketTimelineChartData'];
  aggregateReviewerCommentsTimeline: TimelineHelpers['aggregateReviewerCommentsTimeline'];
  aggregateReviewerApprovalsTimeline: TimelineHelpers['aggregateReviewerApprovalsTimeline'];
}

// The trend note under the reviewer activity chart, shared by the default
// value and ReviewStatsProvider.
export const buildActivityTrendNote = (chartData: ReviewerTimeline | null | undefined): string => {
  if (!chartData?.series || chartData.series.length === 0) {
    return 'No reviewer activity data available to render trends.';
  }
  const totalActivity = chartData.series.reduce(
    (sum, s) => sum + s.points.reduce((ps, p) => ps + p.value, 0),
    0,
  );
  const avgDaily = chartData.dates.length > 0 ? Math.round(totalActivity / chartData.dates.length) : 0;
  return `Total reviewer activity: ${totalActivity} events across ${chartData.dates.length} days (~${avgDaily}/day). Showing top ${chartData.series.length} reviewers. Activity includes comments and submitted reviews on PRs authored by others, excluding Copilot actors.`;
};

const buildDefaultReviewStats = (): ReviewStatsValue => {
  const { normalizeRowMetrics, buildReviewerStats, applyStatsControls } =
    createPrReviewStatsAggregationHelpers();
  const {
    aggregateReviewerActivityTimeline,
    aggregateReviewerCommentsTimeline,
    aggregateReviewerApprovalsTimeline,
  } = createPrReviewStatsTimelineHelpers();
  const { bucketTimelineChartData } = createPrReviewStatsDateBucketingHelpers();
  const getNormalizedStatsDateRange = () => ({ start: '', end: '', startDate: '', endDate: '' });

  return {
    statsViewState: {},
    setStatsViewState: () => {},
    normalizeRowMetrics,
    buildReviewerStats,
    applyStatsControls,
    getNormalizedStatsDateRange,
    renderActivityTrendNote: (rows, actorsMap = {}) =>
      buildActivityTrendNote(aggregateReviewerActivityTimeline(rows, actorsMap, getNormalizedStatsDateRange())),
    bucketTimelineChartData,
    aggregateReviewerCommentsTimeline,
    aggregateReviewerApprovalsTimeline,
  };
};

export const defaultReviewStats = buildDefaultReviewStats();

export const ReviewStatsContext = createContext<ReviewStatsValue>(defaultReviewStats);

export function useReviewStats(): ReviewStatsValue {
  return useContext(ReviewStatsContext);
}
