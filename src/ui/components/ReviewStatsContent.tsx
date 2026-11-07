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
 * component stopped needing to be pushed data).
 *
 * Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): `buildReviewerStats`/
 * `applyStatsControls` now come from useReviewStats()
 * (state/ReviewStatsContext.tsx, components/ReviewStatsProvider.tsx),
 * which derives them from PrDataContext's `statsViewState` - now real
 * state (owned by ReviewStatsControls), not just an invalidation-trigger
 * snapshot, so the `stats` useMemo below can depend on it directly with no
 * exhaustive-deps suppression needed.
 *
 * The chart visuals (formerly createStatsVisuals in
 * pr-review-stats-visuals/chart.component.js - ~900 lines of hand-rolled
 * DOM chart building) are now real JSX (see StatsVisuals.tsx,
 * GraphCard.tsx, ReviewerActivityChart.tsx - Track A of the post-Phase-6
 * migration follow-up, REACT_MIGRATION_PLAN.md), rendered directly below
 * rather than wrapped via a ref+useEffect bridge into a vanilla builder.
 *
 * Phase H.16 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 2): the "View in table" buttons (cards' and the reviewer
 * table's own expandable sources) now go through useNavigateToPrInTable()
 * (state/) instead of window.navigateToPrInTableFromStats (deleted
 * outright, along with its sibling window.navigateToPrInTableFromAuthorInsights) -
 * same hook AuthorInsightsPrLink.tsx now uses, same "dispatch
 * pr-navigate-to-insights, let PrTableApp own the DOM lookup/scroll/focus"
 * behavior the old bridge's navigateToPrInTable already had. No `repo` is
 * passed here (unchanged from before) - this component's source items
 * don't carry one yet, same as the bridge's own prior behavior.
 *
 * @module components/ReviewStatsContent
 */

import React, { useMemo, useRef, useState, type ReactNode } from 'react';
import { StatsVisuals } from './StatsVisuals';
import { usePrData } from '../state/PrDataContext';
import { useReviewStats, type ReviewStatsValue } from '../state/ReviewStatsContext';
import { useIsTabPanelVisible } from '../state/useIsTabPanelVisible';
import { useNavigateToPrInTable } from '../state/useNavigateToPrInTable';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { useReviewStatsColumns } from '../state/useReviewStatsColumns';
import { REVIEW_STATS_FILTER_MODES } from './ReviewStatsControls';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { MultiSelectDropdown } from './ui/MultiSelectDropdown';
import { Tooltip } from './ui/Tooltip';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.ts';
import { createPrUserInitialsHelpers } from '../helpers/pr-user-initials.helpers.ts';
import {
  isReviewStatsColumnShown,
  REVIEW_STATS_COLUMN_CATALOG,
  type ReviewStatsColumnChoices,
} from '../helpers/review-stats-columns.helpers.ts';
import {
  REVIEW_STATS_CARD_EXPLANATIONS,
  REVIEW_STATS_COLUMN_EXPLANATIONS,
} from '../helpers/review-stats-explanations.helpers.ts';
import type { ReviewerRow as ReviewerRowData, StatsSource } from '../helpers/pr-review-stats-aggregation.helpers.ts';

const { formatIsoDatetime } = createPrFormattingHelpers();
const { getUserInitials } = createPrUserInitialsHelpers();

// The extra text after a source's PR (e.g. "3 comments").
type SourceFormatter = (item: StatsSource) => string;
type SourceSection = [label: string, items: StatsSource[], formatter: SourceFormatter];
// activeReviewerCount: reviewers with any activity in the date range,
// before Show and Minimum comments.
type ControlledStats = ReturnType<ReviewStatsValue['applyStatsControls']> & { activeReviewerCount: number };

function SourceItemRow({ item, detailText }: { item: StatsSource; detailText: string }) {
  const navigateToPrInTable = useNavigateToPrInTable();
  const prNumber = String(item?.prNumber || '').trim();
  const prTitle = String(item?.prTitle || '').trim();
  const label = prNumber && prTitle ? `PR #${prNumber}: ${prTitle}` : prNumber ? `PR #${prNumber}` : prTitle || 'Unknown source';
  const prUrl = String(item?.prUrl || '').trim();
  const author = String(item?.prAuthor || item?.author || item?.authorLogin || '').trim();
  const detailParts: string[] = [];
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
            title="Show this PR in the Pull requests view"
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

function SourcesDetails({ items, formatter }: { items: StatsSource[] | undefined; formatter: SourceFormatter }) {
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

// A card's label or a column heading, with how it's counted on hover and
// focus (review-stats-explanations.helpers.ts).
function Explained({ explanation, className, children }: { explanation: string; className?: string; children: ReactNode }) {
  return (
    <Tooltip content={explanation} focusTarget>
      <span className={['stats-explained', className].filter(Boolean).join(' ')}>{children}</span>
    </Tooltip>
  );
}

interface StatCardProps {
  label: string;
  explanation: string;
  value: string;
  detail?: string;
  sources?: StatsSource[];
  formatter: SourceFormatter;
}

function StatCard({ label, explanation, value, detail, sources, formatter }: StatCardProps) {
  return (
    <div className="stat-card" role="group" aria-label={label}>
      <Explained explanation={explanation} className="stat-card-label">
        {label}
      </Explained>
      <span className="stat-card-value">{value}</span>
      {detail && <span className="stat-card-detail">{detail}</span>}
      <SourcesDetails items={sources} formatter={formatter} />
    </div>
  );
}

const getReviewerSourceSections = (reviewer: ReviewerRowData): SourceSection[] =>
  (
    [
      ['Comments', reviewer.sources.comments, (item) => `${item.count} comments`],
      ['Reviews', reviewer.sources.reviews, (item) => `${item.count} reviews (${item.approvals} approvals)`],
      [
        'Risky approvals',
        reviewer.sources.riskyApprovals,
        (item) => `approved ${formatIsoDatetime(item.approvedAt || '-')}`,
      ],
      ['Useful signals', reviewer.sources.usefulnessSignals, (item) => `${item.count} usefulness signals`],
    ] satisfies SourceSection[]
  ).filter(([, items]) => Array.isArray(items) && items.length > 0);

function ReviewerSourcesContent({ sections }: { sections: SourceSection[] }) {
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

// The columns after Reviewer that show (the Columns menu's choices).
const shownColumnKeys = (choices: ReviewStatsColumnChoices) =>
  REVIEW_STATS_COLUMN_CATALOG.filter(({ key }) => isReviewStatsColumnShown(choices, key)).map(({ key }) => key);

// "Aug 6, 2026" from an <input type="date"> value.
const formatStatsDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};

// "since Aug 6, 2026", "between ... and ...", "up to ...", or '' with no dates.
const describeStatsDateRange = ({ startDate, endDate }: { startDate?: string; endDate?: string }) => {
  if (startDate && endDate) return `between ${formatStatsDate(startDate)} and ${formatStatsDate(endDate)}`;
  if (startDate) return `since ${formatStatsDate(startDate)}`;
  if (endDate) return `up to ${formatStatsDate(endDate)}`;
  return '';
};

// The table's only row when it lists no one: why, and the way out - the
// date range (it starts three months back), or Show and Minimum comments.
// The button goes once pressed, so onCleared moves focus to the table
// rather than leaving it nowhere.
function StatsTableEmpty({
  activeReviewerCount,
  columnCount,
  onCleared,
}: {
  activeReviewerCount: number;
  columnCount: number;
  onCleared: () => void;
}) {
  const { statsViewState, getNormalizedStatsDateRange, setStatsViewState } = useReviewStats();
  const range = describeStatsDateRange(getNormalizedStatsDateRange());
  const clear = (patch: Parameters<typeof setStatsViewState>[0]) => {
    setStatsViewState(patch);
    onCleared();
  };
  let message: string;
  let action: ReactNode = null;
  if (activeReviewerCount > 0) {
    const who = activeReviewerCount === 1 ? '1 reviewer has' : `${activeReviewerCount} reviewers have`;
    // Says only what's set: "No reviewers with risky approvals and at
    // least 3 comments."
    const minComments = Number(statsViewState?.minComments) || 0;
    const wanted = [
      REVIEW_STATS_FILTER_MODES.find(([value]) => value !== 'all' && value === statsViewState?.filterMode)?.[1],
      minComments > 0 && `at least ${minComments} ${minComments === 1 ? 'comment' : 'comments'}`,
    ].filter(Boolean);
    message = `No reviewers with ${wanted.length ? wanted.join(' and ') : 'those settings'}. ${who} activity${range ? ` ${range}` : ''}.`;
    action = (
      <Button onClick={() => clear({ filterMode: 'all', minComments: 0 })}>
        Show all reviewers
      </Button>
    );
  } else if (range) {
    message = `No reviewer activity ${range}.`;
    action = (
      <Button onClick={() => clear({ startDate: '', endDate: '' })}>
        Clear dates
      </Button>
    );
  } else {
    message = "No reviewer activity yet: no one has commented on or reviewed someone else's PR.";
  }
  return (
    <tr className="stats-table-empty">
      <td colSpan={columnCount}>
        <div className="stats-table-empty-content">
          <span>{message}</span>
          {action}
        </div>
      </td>
    </tr>
  );
}

// The reviewer's avatar and name, as the PR table's Who column; the
// login on hover when the name differs.
function ReviewerIdentity({ reviewer }: { reviewer: ReviewerRowData }) {
  const { getEffectiveViewerLogin } = useActorIdentity();
  const login = String(reviewer.login || '');
  const name = String(reviewer.name || login);
  const viewerLogin = String(getEffectiveViewerLogin({}) || '').toLowerCase();
  const isViewer = Boolean(viewerLogin) && login.toLowerCase() === viewerLogin;
  return (
    <span className="stats-reviewer" title={name !== login ? login : undefined}>
      <Avatar initials={getUserInitials(name, login)} login={login} isViewer={isViewer} size="sm" />
      <span>
        {name}
        {isViewer && <span className="stats-reviewer-you"> (you)</span>}
      </span>
    </span>
  );
}

function ReviewerRow({ reviewer, columnKeys }: { reviewer: ReviewerRowData; columnKeys: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const sections = getReviewerSourceSections(reviewer);
  const hasSources = sections.length > 0;
  const showsSources = columnKeys.includes('sources');

  return (
    <>
      <tr>
        <th scope="row">
          <ReviewerIdentity reviewer={reviewer} />
        </th>
        {columnKeys.map((key) =>
          key === 'sources' ? (
            <td key={key} className="stats-sources-cell">
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
          ) : (
            <td key={key}>{String(reviewer[key as keyof ReviewerRowData] ?? 0)}</td>
          ),
        )}
      </tr>
      <tr className="stats-sources-row" hidden={!expanded || !showsSources}>
        <td colSpan={columnKeys.length + 1} className="stats-sources-row-cell">
          {hasSources ? <ReviewerSourcesContent sections={sections} /> : 'No sources'}
        </td>
      </tr>
    </>
  );
}

export function ReviewStatsContent() {
  const { payload } = usePrData();
  const { buildReviewerStats, applyStatsControls, getNormalizedStatsDateRange, renderActivityTrendNote } =
    useReviewStats();
  const rows = useMemo(() => Object.values(payload?.byPrNumber || {}), [payload]);
  const actorsMap = payload?.actorsMap || {};
  const isVisible = useIsTabPanelVisible('tab-panel-review-stats');
  const lastStatsRef = useRef<ControlledStats | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const { choices: columnChoices, setColumnShown } = useReviewStatsColumns();
  const columnKeys = shownColumnKeys(columnChoices);

  // Memoized on [payload, buildReviewerStats, applyStatsControls, isVisible]
  // specifically, not [rows, actorsMap] (which would be new references on
  // every render) - both rows/actorsMap are themselves fully determined by
  // payload, so this still only recomputes when the underlying data or
  // Review Stats settings actually change (buildReviewerStats/
  // applyStatsControls get a new reference from useReviewStats() whenever
  // statsViewState does - see ReviewStatsProvider.tsx). While hidden, skips
  // straight to the last computed value instead of re-running them -
  // isVisible flipping back to true re-triggers this useMemo, so the very
  // next payload/settings change while visible again catches up
  // immediately (see useIsTabPanelVisible above).
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
    const computed = { ...applyStatsControls({ summary, reviewerRows }), activeReviewerCount: reviewerRows.length };
    lastStatsRef.current = computed;
    return computed;
  }, [payload, buildReviewerStats, applyStatsControls, isVisible]);

  if (!stats) {
    return <p className="stats-empty">No filtered rows available for review statistics.</p>;
  }

  const dateRange = getNormalizedStatsDateRange();
  const dateText =
    dateRange.startDate || dateRange.endDate
      ? ` Date range: ${dateRange.startDate || 'start'} to ${dateRange.endDate || 'end'}.`
      : '';
  const trendNoteText = renderActivityTrendNote(rows, actorsMap) || '';

  return (
    <>
      <div className="stats-grid">
        <StatCard
          label="PRs"
          explanation={REVIEW_STATS_CARD_EXPLANATIONS.prs}
          value={String(stats.summary.rows)}
          detail={dateRange.startDate || dateRange.endDate ? 'With review activity in the dates' : 'Every stored PR'}
          sources={stats.summary.sources.rows}
          formatter={(item) => {
            const author = String(item?.prAuthor || '').trim();
            return author ? `PR author: ${author}` : '';
          }}
        />
        <StatCard
          label="Comments on others' PRs"
          explanation={REVIEW_STATS_CARD_EXPLANATIONS.commentsOnOthersPrs}
          value={String(stats.summary.commentsOnOthersPrs)}
          detail="Top-level and thread comments combined"
          sources={stats.summary.sources.commentsOnOthersPrs}
          formatter={(item) => `${item.reviewer} | ${item.count} comments`}
        />
        <StatCard
          label="Approvals"
          explanation={REVIEW_STATS_CARD_EXPLANATIONS.approvals}
          value={String(stats.summary.approvals)}
          detail={`${stats.summary.riskyApprovals} risky | ${stats.summary.highRiskApprovals} high-risk`}
          sources={stats.summary.sources.approvals}
          formatter={(item) => `${item.reviewer} | approved ${formatIsoDatetime(item.approvedAt || '-')}`}
        />
        <StatCard
          label="Comment usefulness"
          explanation={REVIEW_STATS_CARD_EXPLANATIONS.usefulness}
          value={String(stats.summary.usefulnessSignals)}
          detail={`${stats.summary.commentsFollowedByAuthorCommit} comments were followed by author commits`}
          sources={stats.summary.sources.usefulnessSignals}
          formatter={(item) => `${item.reviewer} | ${item.count} signals`}
        />
      </div>

      <StatsVisuals stats={stats} rows={rows} actorsMap={actorsMap} />

      <div className="stats-table-bar">
        <MultiSelectDropdown
          listId="review-stats-columns"
          label="Columns"
          idPrefix="review-stats-column"
          className="stats-columns"
          options={REVIEW_STATS_COLUMN_CATALOG.map(({ key, label }) => ({ value: key, label }))}
          checked={new Set(columnKeys)}
          onToggle={(key) => setColumnShown(key, !columnKeys.includes(key))}
        />
      </div>

      {/* Scrolls sideways when the columns don't fit, Reviewer staying put. */}
      <div className="stats-table-scroll">
        <table ref={tableRef} className="stats-table" aria-label="Reviewers" tabIndex={-1}>
          <thead>
            <tr>
              <th scope="col">
                <Explained explanation={REVIEW_STATS_COLUMN_EXPLANATIONS.reviewer}>Reviewer</Explained>
              </th>
              {REVIEW_STATS_COLUMN_CATALOG.filter(({ key }) => columnKeys.includes(key)).map(({ key, label, explanation }) => (
                <th key={key} scope="col">
                  <Explained explanation={explanation}>{label}</Explained>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.reviewerRows.length === 0 ? (
              <StatsTableEmpty
                activeReviewerCount={stats.activeReviewerCount}
                columnCount={columnKeys.length + 1}
                onCleared={() => tableRef.current?.focus()}
              />
            ) : (
              stats.reviewerRows.map((reviewer) => (
                <ReviewerRow key={reviewer.login || reviewer.name} reviewer={reviewer} columnKeys={columnKeys} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {stats.reviewerRows.length > 0 && (
        <p className="stats-note">
          {`Showing ${stats.reviewerRows.length} of ${stats.totalBeforeLimit} reviewers after stats filters. Stats are computed from all stored rows and use saved per-PR metrics.${dateText}`}
        </p>
      )}

      <p className="stats-note">{trendNoteText}</p>
    </>
  );
}
