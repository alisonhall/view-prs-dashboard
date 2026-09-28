import { useMemo } from 'react';
import { ReviewStatsContext } from '../state/ReviewStatsContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { usePrData } from '../state/PrDataContext';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';
import { createPrStatusDisplayHelpers } from '../helpers/pr-status-display.helpers.js';
import { createPrReviewStatsAggregationHelpers } from '../helpers/pr-review-stats-aggregation.helpers.js';
import { createPrReviewStatsTimelineHelpers } from '../helpers/pr-review-stats-timeline.helpers.js';
import { createPrReviewStatsDateBucketingHelpers } from '../helpers/pr-review-stats-date-bucketing.helpers.js';

const { toCount } = createPrFormattingHelpers();
const { formatTitleWithIcons } = createPrStatusDisplayHelpers();
const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md, and
 * state/ReviewStatsContext.jsx's own comment): derives the Review Stats
 * aggregation functions straight from PrDataContext's statsViewState (real
 * React state, owned by ReviewStatsControls via setStatsViewState) and
 * ActorIdentityContext, replacing the ~10 window.* bridges index.page.js
 * used to assign for this tab.
 *
 * Must be mounted inside both <PrDataProvider> and the
 * <ActorIdentityContext.Provider> it sets up - see react-app.jsx's AppRoot
 * for the actual nesting. Reads statsViewState directly via usePrData(),
 * so (unlike NeedsAttentionProvider) no separate "punch through the
 * reconciliation bailout" trick is needed here - this component already
 * genuinely depends on PrDataContext's value.
 */
export function ReviewStatsProvider({ children }) {
  const { statsViewState, setStatsViewState } = usePrData();
  const { normalizeActorLogin, getPreferredActorKey, resolveActorDisplayName } = useActorIdentity();

  const value = useMemo(() => {
    const getNormalizedStatsDateRange = () => {
      const rawStart = String(statsViewState?.startDate || '').trim();
      const rawEnd = String(statsViewState?.endDate || '').trim();
      const start = rawStart ? `${rawStart}T00:00:00Z` : '';
      const end = rawEnd ? `${rawEnd}T23:59:59Z` : '';

      if (start && end && start > end) {
        return { start: `${rawEnd}T00:00:00Z`, end: `${rawStart}T23:59:59Z`, startDate: rawEnd, endDate: rawStart };
      }
      return { start, end, startDate: rawStart, endDate: rawEnd };
    };

    const isWithinStatsDateRange = (isoValue, range = getNormalizedStatsDateRange()) => {
      const value = String(isoValue || '').trim();
      if (!range.start && !range.end) return true;
      if (!value) return false;
      if (range.start && value < range.start) return false;
      if (range.end && value > range.end) return false;
      return true;
    };

    const { normalizeRowMetrics, buildReviewerStats, applyStatsControls } = createPrReviewStatsAggregationHelpers({
      toCount,
      asArray,
      getNormalizedStatsDateRange,
      normalizeActorLogin,
      getPreferredActorKey,
      formatTitleWithIcons,
      isWithinStatsDateRange,
      resolveActorDisplayName,
      statsViewState,
    });

    const { getTimelineDateKeys, bucketTimelineChartData } = createPrReviewStatsDateBucketingHelpers({
      getNormalizedStatsDateRange,
    });

    const {
      aggregateReviewerActivityTimeline,
      aggregateReviewerCommentsTimeline,
      aggregateReviewerApprovalsTimeline,
    } = createPrReviewStatsTimelineHelpers({
      asArray,
      getPreferredActorKey,
      normalizeActorLogin,
      isWithinStatsDateRange,
      resolveActorDisplayName,
      getTimelineDateKeys,
    });

    const renderActivityTrendNote = (rows, actorsMap = {}) => {
      const range = getNormalizedStatsDateRange();
      const chartData = aggregateReviewerActivityTimeline(rows, actorsMap, range);
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
      statsViewState,
      setStatsViewState,
      normalizeRowMetrics,
      buildReviewerStats,
      applyStatsControls,
      getNormalizedStatsDateRange,
      renderActivityTrendNote,
      bucketTimelineChartData,
      aggregateReviewerCommentsTimeline,
      aggregateReviewerApprovalsTimeline,
    };
  }, [statsViewState, setStatsViewState, normalizeActorLogin, getPreferredActorKey, resolveActorDisplayName]);

  return <ReviewStatsContext.Provider value={value}>{children}</ReviewStatsContext.Provider>;
}
