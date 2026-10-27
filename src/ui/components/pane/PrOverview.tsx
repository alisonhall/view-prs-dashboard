import { Fragment, type ReactNode } from 'react';
import type { PrData, PrEntry } from '../../types/pr-data.ts';
import type { ActorsMap } from '../../helpers/pr-actor-identity.helpers.ts';
import { LinesChangedInsight } from '../insights/LinesChangedInsight';
import { ApprovalRiskSection } from '../insights/ApprovalRiskSection';
import { usePrInsightsDisplay } from '../../state/PrInsightsDisplayContext';
import { createPrFormattingHelpers } from '../../helpers/pr-formatting.helpers.ts';

const { formatIsoDatetime, toCount } = createPrFormattingHelpers();

/**
 * The detail pane's Overview tab (UI_REDESIGN_PLAN.md, phase 4): the
 * insights' key/value rows, grouped as Review / People / Changes, then
 * Approval risk details and Data freshness as collapsible groups. It
 * replaces PrInsightsRow's single grid and its STATUS/CHK/MRG badges (the
 * same values are the Review group's first rows); the activity timeline
 * moved to the Activity tab.
 */
export interface PrOverviewProps {
  entry: PrEntry;
  pr: PrData;
  actorsMap: ActorsMap;
}

interface Row {
  label: string;
  labelTitle?: string;
  value: ReactNode;
}

function Group({ id, heading, rows }: { id: string; heading: string; rows: Row[] }) {
  return (
    <div className="pr-overview-group" role="group" aria-labelledby={id}>
      <h3 className="pr-overview-heading" id={id}>
        {heading}
      </h3>
      <Rows rows={rows} />
    </div>
  );
}

// A two-column grid (styles/insights.css's .insight-grid): each key and value is a
// grid item of its own.
function Rows({ rows }: { rows: Row[] }) {
  return (
    <div className="insight-grid">
      {rows.map((row) => (
        <Fragment key={row.label}>
          <span className="insight-key" title={row.labelTitle}>
            {row.label}
          </span>
          <span className="insight-value">{row.value}</span>
        </Fragment>
      ))}
    </div>
  );
}

export function PrOverview({ entry, pr, actorsMap }: PrOverviewProps) {
  const {
    parseMarkerState,
    formatApproversDisplay,
    formatRequestedReviewersDisplay,
    formatAssignedUsersDisplay,
    normalizeRowMetrics,
    getOpenConversationCountWithMe,
    getViewedFilesSummary,
    formatReviewFootprint,
    formatConversationStatus,
    formatApprovalRisk,
    formatCommentUsefulness,
  } = usePrInsightsDisplay();

  const prNumber = String(pr?.number ?? '');
  const idPrefix = `pr-overview-${prNumber}`;
  const checkState = String(pr.checkState || parseMarkerState(pr.titleDisplay, 'CHK') || '-');
  const mergeState = String(pr.mergeState || parseMarkerState(pr.titleDisplay, 'MRG') || '-');
  const metrics = normalizeRowMetrics(pr);
  const openConversations = getOpenConversationCountWithMe(pr);

  const review: Row[] = [
    { label: 'Status', value: String(pr.status || '-').toUpperCase() },
    { label: 'CHK state', value: checkState },
    { label: 'Mergeability', value: mergeState },
    {
      label: openConversations?.isViewerSpecific ? 'Open conversations with me' : 'Open conversations',
      value: String(toCount(openConversations?.count)),
    },
    { label: 'Review footprint', value: formatReviewFootprint(metrics) },
    { label: 'Conversation status', value: formatConversationStatus(metrics) },
    { label: 'Approval risk', value: formatApprovalRisk(metrics) },
    { label: 'Comment usefulness', value: formatCommentUsefulness(metrics) },
  ];
  const people: Row[] = [
    { label: 'Approvers', value: formatApproversDisplay(pr, actorsMap) },
    { label: 'Reviewers', value: formatRequestedReviewersDisplay(pr, actorsMap) },
    { label: 'Assigned', value: formatAssignedUsersDisplay(pr, actorsMap) },
  ];
  const changes: Row[] = [
    // Its copy button is in the pane's header.
    { label: 'Source branch', value: String(pr.sourceBranch || '-') },
    { label: 'Merged to', value: String(pr.targetBranch || '-') },
    { label: 'Lines changed', value: <LinesChangedInsight pr={pr} /> },
    { label: 'Viewed files', value: getViewedFilesSummary(pr) },
  ];
  const freshness: Row[] = [
    {
      label: 'Latest data timestamp',
      labelTitle: 'When source PR data (comments/reviews/threads/metadata) was last updated.',
      value: formatIsoDatetime(pr.sourceUpdatedAt || '-'),
    },
    {
      label: 'Last checked for updates',
      labelTitle: 'When this dashboard last evaluated the PR for new changes during a script run.',
      value: formatIsoDatetime(entry?.updatedAt || '-'),
    },
    { label: 'Baseline', value: formatIsoDatetime(pr.baseline || '-') },
  ];

  return (
    <div className="pr-overview" data-pr-number={prNumber}>
      <Group id={`${idPrefix}-review`} heading="Review" rows={review} />
      <Group id={`${idPrefix}-people`} heading="People" rows={people} />
      <Group id={`${idPrefix}-changes`} heading="Changes" rows={changes} />
      <ApprovalRiskSection metrics={metrics} actorsMap={actorsMap} />
      <details className="insight-section" data-insight-key="data freshness">
        <summary>Data freshness</summary>
        <Rows rows={freshness} />
      </details>
    </div>
  );
}
