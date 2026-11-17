import { useMemo, type ReactNode } from 'react';
import type { PrEntry } from '../types/pr-data.ts';
import type { ActorsMap } from '../helpers/pr-actor-identity.helpers.ts';
import { buildActivityTrendNote, ReviewStatsContext, type ReviewStatsValue } from '../state/ReviewStatsContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { usePrData } from '../state/PrDataContext';
import { asArray } from '../helpers/pr-as-array.helpers.ts';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';
import { createPrStatusDisplayHelpers } from '../helpers/pr-status-display.helpers.ts';
import { createPrReviewStatsAggregationHelpers } from '../helpers/pr-review-stats-aggregation.helpers.ts';
import { createPrReviewStatsTimelineHelpers } from '../helpers/pr-review-stats-timeline.helpers.ts';
import {
  createPrReviewStatsDateBucketingHelpers,
  type StatsDateRange,
} from '../helpers/pr-review-stats-date-bucketing.helpers.ts';

const { toCount } = createPrFormattingHelpers();
const { formatTitleWithIcons } = createPrStatusDisplayHelpers();

/**
 * Derives the Review Stats aggregation functions (see
 * state/ReviewStatsContext.tsx) from PrDataContext's statsViewState (React
 * state, set by ReviewStatsControls via setStatsViewState) and
 * ActorIdentityContext.
 *
 * Must be mounted inside both <PrDataProvider> and the
 * <ActorIdentityContext.Provider> it sets up - see react-app.tsx and
 * AppShell for the actual nesting. Reads statsViewState directly via usePrData(),
 * so (unlike NeedsAttentionProvider) no separate "punch through the
 * reconciliation bailout" trick is needed here - this component already
 * genuinely depends on PrDataContext's value.
 */
export function ReviewStatsProvider({ children }: { children?: ReactNode }) {
  const { statsViewState, setStatsViewState } = usePrData();
  const { normalizeActorLogin, getPreferredActorKey, resolveActorDisplayName } = useActorIdentity();

  const value = useMemo<ReviewStatsValue>(() => {
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

    const isWithinStatsDateRange = (isoValue: unknown, range: StatsDateRange = getNormalizedStatsDateRange()) => {
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

    // Everyone with activity in the dates, whoever's picked: the
    // Reviewers list's options.
    const { buildReviewerStats: buildEveryReviewerStats } = createPrReviewStatsAggregationHelpers({
      toCount,
      asArray,
      getNormalizedStatsDateRange,
      normalizeActorLogin,
      getPreferredActorKey,
      formatTitleWithIcons,
      isWithinStatsDateRange,
      resolveActorDisplayName,
      statsViewState: { ...statsViewState, reviewers: [] },
    });
    const listReviewers = (rows: Iterable<PrEntry>, actorsMap: ActorsMap = {}) =>
      buildEveryReviewerStats(rows, actorsMap)
        .reviewerRows.map(({ login, name }) => ({ login, name: String(name || login) }))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    const pickedReviewers = new Set(asArray(statsViewState?.reviewers).map((login) => String(login || '').trim()).filter(Boolean));
    const isIncludedReviewer = (login: string) => pickedReviewers.size === 0 || pickedReviewers.has(login);

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
      isIncludedReviewer,
    });

    return {
      statsViewState,
      setStatsViewState,
      normalizeRowMetrics,
      buildReviewerStats,
      applyStatsControls,
      listReviewers,
      getNormalizedStatsDateRange,
      renderActivityTrendNote: (rows, actorsMap = {}) =>
        buildActivityTrendNote(aggregateReviewerActivityTimeline(rows, actorsMap, getNormalizedStatsDateRange())),
      bucketTimelineChartData,
      aggregateReviewerCommentsTimeline,
      aggregateReviewerApprovalsTimeline,
    };
  }, [statsViewState, setStatsViewState, normalizeActorLogin, getPreferredActorKey, resolveActorDisplayName]);

  return <ReviewStatsContext.Provider value={value}>{children}</ReviewStatsContext.Provider>;
}
