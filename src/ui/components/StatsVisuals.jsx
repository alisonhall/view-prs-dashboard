/**
 * StatsVisuals - React port of index.page.js's createStatsVisuals
 * (pr-review-stats-visuals.component.js), composing GraphCard and
 * ReviewerActivityChart for the Review Stats tab. See
 * REACT_MIGRATION_PLAN.md Track A.
 *
 * Rendered directly by ReviewStatsContent (no more ref+useEffect wrapper
 * around a vanilla DOM builder). Still reads the underlying reviewer-
 * activity timeline aggregation and date-range helpers off window, since
 * those are pure data-shaping functions with no DOM involvement and moving
 * them off window is Track C's (orchestration) concern, not this one.
 *
 * @module components/StatsVisuals
 */

import { GraphCard } from './GraphCard';
import { ReviewerActivityChart } from './ReviewerActivityChart';

const asArray = (value) => (window.asArray ? window.asArray(value) : Array.isArray(value) ? value : []);
const toCount = (value) => (window.toCount ? window.toCount(value) : Number.parseInt(value, 10) || 0);

const sumReviewerMetric = (reviewerRows, key) => asArray(reviewerRows).reduce((total, reviewer) => total + toCount(reviewer?.[key]), 0);

const setSortBy = (sortBy) => window.updateStatsViewStateAndRerender?.({ sortBy });

export function StatsVisuals({ stats, rows = [], actorsMap = {} }) {
  const reviewerRows = asArray(stats?.reviewerRows);
  if (!reviewerRows.length) {
    return null;
  }

  const visibleTotals = [
    { label: 'Comments', value: sumReviewerMetric(reviewerRows, 'comments'), tone: 'comments' },
    { label: 'Reviews', value: sumReviewerMetric(reviewerRows, 'reviews'), tone: 'reviews' },
    { label: 'Approvals', value: sumReviewerMetric(reviewerRows, 'approvals'), tone: 'approvals' },
    { label: 'Useful signals', value: sumReviewerMetric(reviewerRows, 'usefulnessSignals'), tone: 'usefulness' },
    { label: 'Risky approvals', value: sumReviewerMetric(reviewerRows, 'riskyApprovals'), tone: 'risk' },
  ].filter((item) => item.value > 0);

  const topComments = reviewerRows
    .filter((reviewer) => toCount(reviewer?.comments) > 0)
    .slice(0, 8)
    .map((reviewer) => ({
      label: reviewer.name,
      segments: [
        { label: 'Comments', value: reviewer.comments, tone: 'comments' },
        { label: 'Reviews', value: reviewer.reviews, tone: 'reviews' },
        { label: 'Approvals', value: reviewer.approvals, tone: 'approvals' },
      ],
      login: reviewer.login,
      detail: `${reviewer.threadComments} thread comments | ${reviewer.prCount} PRs`,
    }));

  const topApprovals = reviewerRows
    .filter((reviewer) => toCount(reviewer?.approvals) > 0)
    .slice(0, 8)
    .map((reviewer) => ({
      label: reviewer.name,
      segments: [
        { label: 'Approvals', value: reviewer.approvals, tone: 'approvals' },
        { label: 'Risk signals', value: reviewer.riskyApprovals, tone: 'risk' },
        { label: 'High-risk', value: reviewer.highRiskApprovals, tone: 'risk' },
      ],
      login: reviewer.login,
      detail: `${reviewer.riskyApprovals} risky | ${reviewer.highRiskApprovals} high-risk`,
    }));

  const topUsefulness = reviewerRows
    .filter((reviewer) => toCount(reviewer?.usefulnessSignals) > 0)
    .slice(0, 8)
    .map((reviewer) => ({
      label: reviewer.name,
      segments: [
        { label: 'Resolved threads', value: reviewer.resolvedThreadComments, tone: 'usefulness' },
        { label: 'Comments followed', value: reviewer.commentsFollowedByAuthorCommit, tone: 'usefulness' },
      ],
      login: reviewer.login,
      detail: `${reviewer.commentsFollowedByAuthorCommit} comments followed by author commits`,
    }));

  const range = window.getNormalizedStatsDateRange ? window.getNormalizedStatsDateRange() : {};
  const reviewerCommentsData = window.aggregateReviewerCommentsTimeline
    ? window.aggregateReviewerCommentsTimeline(rows, actorsMap, range)
    : { dates: [], series: [] };
  const reviewerCommentsDataSorted = {
    ...reviewerCommentsData,
    series: [...asArray(reviewerCommentsData?.series)].sort((a, b) => {
      const totalA = asArray(a?.points).reduce((sum, point) => sum + toCount(point?.value), 0);
      const totalB = asArray(b?.points).reduce((sum, point) => sum + toCount(point?.value), 0);
      if (totalB !== totalA) return totalB - totalA;
      return String(a?.actor || '').localeCompare(String(b?.actor || ''));
    }),
  };
  const reviewerApprovalsData = window.aggregateReviewerApprovalsTimeline
    ? window.aggregateReviewerApprovalsTimeline(rows, actorsMap, range)
    : { dates: [], series: [] };

  const hasAnyContent =
    visibleTotals.length > 0 ||
    topComments.length > 0 ||
    topApprovals.length > 0 ||
    topUsefulness.length > 0 ||
    reviewerCommentsDataSorted.series.length > 0 ||
    reviewerApprovalsData.series.length > 0;
  if (!hasAnyContent) {
    return null;
  }

  return (
    <div className="stats-visuals">
      <GraphCard title="Visible metric totals" subtitle="Based on the reviewers currently shown in the table" items={visibleTotals} onHeaderClick={() => setSortBy('comments')} />
      <GraphCard title="Top reviewers by comments" subtitle="Comments on others' PRs from the visible table rows" items={topComments} onHeaderClick={() => setSortBy('comments')} />
      <GraphCard title="Top reviewers by approvals" subtitle="Approvals, with risky/high-risk context" items={topApprovals} onHeaderClick={() => setSortBy('approvals')} />
      <GraphCard
        title="Top reviewers by useful signals"
        subtitle="Signals combine resolved threads and comments followed by author commits"
        items={topUsefulness}
        onHeaderClick={() => setSortBy('usefulnessSignals')}
      />
      <ReviewerActivityChart
        chartData={reviewerCommentsDataSorted}
        titleOverride="Comments and reviews over time per author"
        subtitleOverride={`Heatmap + line trends for top ${reviewerCommentsDataSorted.series.length} authors (comments and reviews, excluding approvals).`}
      />
      <ReviewerActivityChart
        chartData={reviewerApprovalsData}
        titleOverride="Approvals over time per author"
        subtitleOverride={`Heatmap + line trends for top ${reviewerApprovalsData.series.length} authors (approval activity only).`}
      />
    </div>
  );
}
