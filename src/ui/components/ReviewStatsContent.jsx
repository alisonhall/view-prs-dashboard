/**
 * ReviewStatsContent - React-owned summary cards, chart visuals, reviewer
 * table, and trend note for the "Review Stats" tab, replacing
 * pr-review-stats-summary.component.js's renderStatsSummaryAndTable().
 *
 * Phase 3 (see REACT_MIGRATION_PLAN.md). Mounted once into the static
 * #stats-content-root container (sibling of #stats-controls-root, see
 * ReviewStatsControls.jsx's own comment for why that split exists) and
 * updated via window.updateReviewStatsContent(stats, rows, actorsMap) -
 * the same mount-once/update-via-bridge shape as Phase 1's
 * mountReactPrTable/updateReactPrTable, not the restore-race pattern most
 * of Phase 2 used, since this is pure derived display data with no
 * persisted override.
 *
 * The chart visuals (formerly createStatsVisuals in
 * pr-review-stats-visuals/chart.component.js - ~900 lines of hand-rolled
 * DOM chart building) are now real JSX (see StatsVisuals.jsx,
 * GraphCard.jsx, ReviewerActivityChart.jsx - Track A of the post-Phase-6
 * migration follow-up, REACT_MIGRATION_PLAN.md), rendered directly below
 * rather than wrapped via a ref+useEffect bridge into a vanilla builder.
 *
 * The "View in table" buttons (cards' and the reviewer table's own
 * expandable sources) go through window.navigateToPrInTableFromStats,
 * which reuses prAuthorInsightsPrLinkHelpers' already-React-safe
 * navigateToPrInTable (dispatches 'pr-navigate-to-insights' when React
 * owns the PR table) - not the raw-DOM-mutation version this component's
 * vanilla predecessor built inline, which was never updated for a
 * React-owned PR table and would silently do nothing under it.
 *
 * @module components/ReviewStatsContent
 */

import React, { useState } from 'react';
import { StatsVisuals } from './StatsVisuals';

const formatIsoDatetime = (value) =>
  window.reviewStatsFormatIsoDatetime ? window.reviewStatsFormatIsoDatetime(value) : String(value || '-');

const navigateToPrInTable = (prNumber) => window.navigateToPrInTableFromStats?.(prNumber);

function SourceItemRow({ item, detailText }) {
  const prNumber = String(item?.prNumber || '').trim();
  const prTitle = String(item?.prTitle || '').trim();
  const label = prNumber && prTitle ? `PR #${prNumber}: ${prTitle}` : prNumber ? `PR #${prNumber}` : prTitle || 'Unknown source';
  const prUrl = String(item?.prUrl || '').trim();
  const author = String(item?.prAuthor || item?.author || item?.authorLogin || '').trim();
  const detailParts = [];
  if (author) {
    detailParts.push(`PR author: ${author}`);
  }
  if (detailText) {
    detailParts.push(detailText);
  }

  return (
    <div className="stats-source-item">
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {prUrl ? (
          <a href={prUrl} target="_blank" rel="noreferrer noopener" className="pr-link">
            {label}
          </a>
        ) : (
          <span>{label}</span>
        )}
        {prNumber && (
          <button
            type="button"
            className="author-insights-table-link"
            title="Navigate to PR data tab and scroll to this PR"
            style={{ fontSize: '12px', padding: '3px 6px' }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigateToPrInTable(prNumber);
            }}
          >
            View in table
          </button>
        )}
      </div>
      {detailParts.length > 0 && <span className="stats-source-detail"> | {detailParts.join(' | ')}</span>}
    </div>
  );
}

function SourcesDetails({ items, formatter }) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  return (
    <details className="stats-sources">
      <summary>Show sources ({items.length})</summary>
      <div className="stats-sources-list">
        {items.map((item, index) => (
          <SourceItemRow key={index} item={item} detailText={formatter(item)} />
        ))}
      </div>
    </details>
  );
}

function StatCard({ label, value, detail, sources, formatter }) {
  return (
    <div className="stat-card">
      <span className="stat-card-label">{label}</span>
      <span className="stat-card-value">{value}</span>
      {detail && <span className="stat-card-detail">{detail}</span>}
      <SourcesDetails items={sources} formatter={formatter} />
    </div>
  );
}

const getReviewerSourceSections = (reviewer) =>
  [
    ['Comments', reviewer.sources.comments, (item) => `${item.count} comments`],
    ['Reviews', reviewer.sources.reviews, (item) => `${item.count} reviews (${item.approvals} approvals)`],
    [
      'Risky approvals',
      reviewer.sources.riskyApprovals,
      (item) => `approved ${formatIsoDatetime(item.approvedAt || '-')}`,
    ],
    ['Useful signals', reviewer.sources.usefulnessSignals, (item) => `${item.count} usefulness signals`],
  ].filter(([, items]) => Array.isArray(items) && items.length > 0);

function ReviewerSourcesContent({ sections }) {
  return (
    <div className="stats-sources-group">
      {sections.map(([label, items, formatter]) => (
        <React.Fragment key={label}>
          <div className="stats-sources-group-title">{label}</div>
          <div className="stats-sources-list">
            {items.map((item, index) => (
              <SourceItemRow key={index} item={item} detailText={formatter(item)} />
            ))}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

const STATS_COLUMN_COUNT = 12;

function ReviewerRow({ reviewer }) {
  const [expanded, setExpanded] = useState(false);
  const sections = getReviewerSourceSections(reviewer);
  const hasSources = sections.length > 0;

  return (
    <>
      <tr>
        <td>{reviewer.name}</td>
        <td>{reviewer.comments}</td>
        <td>{reviewer.threadComments}</td>
        <td>{reviewer.reviews}</td>
        <td>{reviewer.approvals}</td>
        <td>{reviewer.riskyApprovals}</td>
        <td>{reviewer.highRiskApprovals}</td>
        <td>{reviewer.usefulnessSignals}</td>
        <td>{reviewer.commentsFollowedByAuthorCommit}</td>
        <td>{reviewer.resolvedThreadComments}</td>
        <td>{reviewer.prCount}</td>
        <td className="stats-sources-cell">
          {hasSources ? (
            <button
              type="button"
              className="stats-sources-toggle"
              aria-expanded={expanded ? 'true' : 'false'}
              onClick={() => setExpanded((previous) => !previous)}
            >
              {expanded ? 'Hide sources' : 'Show sources'}
            </button>
          ) : (
            '-'
          )}
        </td>
      </tr>
      <tr className="stats-sources-row" hidden={!expanded}>
        <td colSpan={STATS_COLUMN_COUNT} className="stats-sources-row-cell">
          {hasSources ? <ReviewerSourcesContent sections={sections} /> : 'No sources'}
        </td>
      </tr>
    </>
  );
}

export function ReviewStatsContent({ stats, rows, actorsMap }) {
  if (!stats) {
    return <p className="stats-empty">No filtered rows available for review statistics.</p>;
  }

  const dateRange = window.getNormalizedStatsDateRange ? window.getNormalizedStatsDateRange() : {};
  const dateText =
    dateRange.startDate || dateRange.endDate
      ? ` Date range: ${dateRange.startDate || 'start'} to ${dateRange.endDate || 'end'}.`
      : '';
  const trendNoteText = window.renderActivityTrendNote
    ? window.renderActivityTrendNote(rows, actorsMap)?.textContent || ''
    : '';

  return (
    <>
      <div className="stats-grid">
        <StatCard
          label="Filtered rows"
          value={String(stats.summary.rows)}
          detail="Current local filter scope"
          sources={stats.summary.sources.rows}
          formatter={(item) => {
            const author = String(item?.prAuthor || '').trim();
            return author ? `PR author: ${author}` : '';
          }}
        />
        <StatCard
          label="Comments on others' PRs"
          value={String(stats.summary.commentsOnOthersPrs)}
          detail="Top-level and thread comments combined"
          sources={stats.summary.sources.commentsOnOthersPrs}
          formatter={(item) => `${item.reviewer} | ${item.count} comments`}
        />
        <StatCard
          label="Approvals"
          value={String(stats.summary.approvals)}
          detail={`${stats.summary.riskyApprovals} risky | ${stats.summary.highRiskApprovals} high-risk`}
          sources={stats.summary.sources.approvals}
          formatter={(item) => `${item.reviewer} | approved ${formatIsoDatetime(item.approvedAt || '-')}`}
        />
        <StatCard
          label="Comment usefulness"
          value={String(stats.summary.usefulnessSignals)}
          detail={`${stats.summary.commentsFollowedByAuthorCommit} comments were followed by author commits`}
          sources={stats.summary.sources.usefulnessSignals}
          formatter={(item) => `${item.reviewer} | ${item.count} signals`}
        />
      </div>

      <StatsVisuals stats={stats} rows={rows} actorsMap={actorsMap} />

      <table className="stats-table">
        <thead>
          <tr>
            {[
              'Reviewer',
              'Comments',
              'Thread comments',
              'Reviews',
              'Approvals',
              'Risky approvals',
              'High-risk approvals',
              'Useful comment signals',
              'Comments → author commit',
              'Resolved thread comments',
              'PRs touched',
              'Sources',
            ].map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.reviewerRows.map((reviewer) => (
            <ReviewerRow key={reviewer.name} reviewer={reviewer} />
          ))}
        </tbody>
      </table>

      <p className="stats-note">
        {`Showing ${stats.reviewerRows.length} of ${stats.totalBeforeLimit} reviewers after stats filters. Stats are computed from all stored rows and use saved per-PR metrics.${dateText}`}
      </p>

      <p className="stats-note">{trendNoteText}</p>
    </>
  );
}
