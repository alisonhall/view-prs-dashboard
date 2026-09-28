import { createContext, useContext } from 'react';
import { createPrReviewStatsAggregationHelpers } from '../helpers/pr-review-stats-aggregation.helpers.js';
import { createPrReviewStatsTimelineHelpers } from '../helpers/pr-review-stats-timeline.helpers.js';
import { createPrReviewStatsDateBucketingHelpers } from '../helpers/pr-review-stats-date-bucketing.helpers.js';

/**
 * Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): the Review Stats
 * tab's sort/filter/topN/minComments/date-range settings (statsViewState)
 * and the pure aggregation functions that depend on them
 * (buildReviewerStats, applyStatsControls, getNormalizedStatsDateRange,
 * renderActivityTrendNote, bucketTimelineChartData,
 * aggregateReviewerCommentsTimeline, aggregateReviewerApprovalsTimeline)
 * used to live in index.page.js, reachable only via ~10 window.* bridges.
 * ReviewStatsProvider (components/ReviewStatsProvider.jsx) derives all of
 * it fresh from PrDataContext's statsViewState (now real React state, not
 * just an invalidation-trigger snapshot) + ActorIdentityContext, and
 * ReviewStatsControls/ReviewStatsContent/StatsVisuals/ReviewerActivityChart
 * read it through this Context instead.
 *
 * Default value (factories called with no arguments, i.e. an empty
 * statsViewState) matches every consuming component's old permissive
 * `window.x || fallback` behavior, so a component rendered without a
 * <ReviewStatsProvider> ancestor still gets sane, settings-unaware
 * behavior with no wrapping required.
 */
const buildDefaultReviewStats = () => {
  const { normalizeRowMetrics, buildReviewerStats, applyStatsControls } =
    createPrReviewStatsAggregationHelpers();
  const {
    aggregateReviewerActivityTimeline,
    aggregateReviewerCommentsTimeline,
    aggregateReviewerApprovalsTimeline,
  } = createPrReviewStatsTimelineHelpers();
  const { bucketTimelineChartData } = createPrReviewStatsDateBucketingHelpers();
  const getNormalizedStatsDateRange = () => ({ start: '', end: '', startDate: '', endDate: '' });
  const renderActivityTrendNote = (rows, actorsMap = {}) => {
    const chartData = aggregateReviewerActivityTimeline(rows, actorsMap, getNormalizedStatsDateRange());
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

  return {
    statsViewState: {},
    setStatsViewState: () => {},
    normalizeRowMetrics,
    buildReviewerStats,
    applyStatsControls,
    getNormalizedStatsDateRange,
    renderActivityTrendNote,
    bucketTimelineChartData,
    aggregateReviewerCommentsTimeline,
    aggregateReviewerApprovalsTimeline,
  };
};

export const defaultReviewStats = buildDefaultReviewStats();

export const ReviewStatsContext = createContext(defaultReviewStats);

export function useReviewStats() {
  return useContext(ReviewStatsContext);
}
