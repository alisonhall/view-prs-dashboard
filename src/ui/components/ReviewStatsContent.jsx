/**
 * ReviewStatsContent - React-owned summary cards, chart visuals, reviewer
 * table, and trend note for the "Review Stats" tab, replacing
 * pr-review-stats-summary.component.js's renderStatsSummaryAndTable().
 *
 * Track C (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md): computes
 * its own `stats` from PrDataContext's `payload` instead of being pushed a
 * pre-built result via window.updateReviewStatsContent (deleted, along
 * with renderStatsView/renderStatsViewIfVisible in index.page.js/
 * pr-render-apply.helpers.js - nothing else needed them once this
 * component stopped needing to be pushed data). `window.buildReviewerStats`/
 * `window.applyStatsControls` are the same pure aggregation functions
 * index.page.js used internally - `applyStatsControls` reads the live
 * vanilla `statsViewState` object by closure, so it's always current
 * regardless of when it's called; `statsViewState` is read from Context
 * here purely to know *when* settings changed (ReviewStatsControls pushes
 * a fresh snapshot on every commit via
 * window.updateReactStatsViewState) - its field values aren't used
 * directly. The computation is `useMemo`-gated on `[payload,
 * statsViewState, isVisible]` so unrelated Context changes (e.g. selecting
 * a different Author Insights author) don't re-trigger it, and (deferred-
 * items follow-up, item 3 - see REACT_MIGRATION_PLAN.md) skips the
 * expensive recompute entirely while its own tab is hidden, via
 * ../state/useIsTabPanelVisible.jsx (promoted out of this file for item 5,
 * once a second consumer needed it) - matching the 5 Author Insights
 * sections' existing behavior, and restoring what the vanilla predecessor
 * did before this component existed.
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

import React, { useMemo, useRef, useState } from 'react';
import { StatsVisuals } from './StatsVisuals';
import { usePrData } from '../state/PrDataContext';
import { useIsTabPanelVisible } from '../state/useIsTabPanelVisible';

const formatIsoDatetime = (value) =>
  window.reviewStatsFormatIsoDatetime ? window.reviewStatsFormatIsoDatetime(value) : String(value || '-');

const navigateToPrInTable = (prNumber) => window.navigateToPrInTableFromStats?.(prNumber);

const buildReviewerStats = (rows, actorsMap) =>
  window.buildReviewerStats ? window.buildReviewerStats(rows, actorsMap) : { summary: null, reviewerRows: [] };

const applyStatsControls = (input) => (window.applyStatsControls ? window.applyStatsControls(input) : null);

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

export function ReviewStatsContent() {
  const { payload, statsViewState } = usePrData();
  const rows = useMemo(() => Object.values(payload?.byPrNumber || {}), [payload]);
  const actorsMap = payload?.actorsMap || {};
  const isVisible = useIsTabPanelVisible('tab-panel-review-stats');
  const lastStatsRef = useRef(null);

  // Memoized on [payload, statsViewState, isVisible] specifically, not
  // [rows, actorsMap] (which would be new references on every render) -
  // both rows/actorsMap are themselves fully determined by payload, so
  // this still only recomputes when the underlying data or Review Stats
  // settings actually change. While hidden, skips straight to the last
  // computed value instead of re-running buildReviewerStats/
  // applyStatsControls - isVisible flipping back to true re-triggers this
  // useMemo, so the very next payload/settings change while visible again
  // catches up immediately (see useIsTabPanelVisible above).
  const stats = useMemo(() => {
    if (!isVisible) {
      return lastStatsRef.current;
    }
    const currentRows = Object.values(payload?.byPrNumber || {});
    if (!currentRows.length) {
      lastStatsRef.current = null;
      return null;
    }
    const currentActorsMap = payload?.actorsMap || {};
    const { summary, reviewerRows } = buildReviewerStats(currentRows, currentActorsMap);
    const computed = applyStatsControls({ summary, reviewerRows });
    lastStatsRef.current = computed;
    return computed;
    // statsViewState is a deliberate invalidation trigger, not read inside
    // this callback (see the module comment above - applyStatsControls
    // reads the live vanilla statsViewState object by closure instead) -
    // exhaustive-deps can't tell "read for its value" apart from "listed
    // purely to know when settings changed," so it flags this as
    // unnecessary; removing it would stop settings changes from
    // triggering a recompute at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, statsViewState, isVisible]);

  if (!stats) {
    return <p className="stats-empty">No filtered rows available for review statistics.</p>;
  }

  const dateRange = window.getNormalizedStatsDateRange ? window.getNormalizedStatsDateRange() : {};
  const dateText =
    dateRange.startDate || dateRange.endDate
      ? ` Date range: ${dateRange.startDate || 'start'} to ${dateRange.endDate || 'end'}.`
      : '';
  const trendNoteText = window.renderActivityTrendNote
    ? window.renderActivityTrendNote(rows, actorsMap) || ''
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
