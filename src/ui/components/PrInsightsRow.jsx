/**
 * PrInsightsRow - the full "More insights" panel content.
 *
 * Matches vanilla's createInsightsDetails (components/pr-row-insights.component.js):
 * status/check/merge badges, a key/value grid, then the Activity sequence,
 * Review conversations, Approval risk details, and Notes sub-sections.
 *
 * @module components/PrInsightsRow
 */

import React from 'react';
import { ActivityEventsSection } from './insights/ActivityEventsSection';
import { ReviewThreadsSection } from './insights/ReviewThreadsSection';
import { ApprovalRiskSection } from './insights/ApprovalRiskSection';
import { NotesSection } from './insights/NotesSection';
import { LinesChangedInsight } from './insights/LinesChangedInsight';
import { ActivityTimelineSummary } from './insights/ActivityTimelineSummary';
import { CopyIconButton } from './CopyIconButton';

function InsightRow({ label, labelTitle, children, endAdornment }) {
  return (
    <>
      <span className="insight-key" title={labelTitle || undefined}>
        {label}
      </span>
      <span className="insight-value">
        {children}
        {endAdornment}
      </span>
    </>
  );
}

export function PrInsightsRow({ entry, pr, actorsMap: actorsMapFromPayload, compositeKey, onDataRefresh }) {
  const parseMarkerState = window.parseMarkerState || (() => '-');
  const formatIsoDatetime = window.formatIsoDatetime || ((value) => String(value || '-'));
  const buildRowActorsMap = window.buildRowActorsMap || ((_row, actorsMap) => actorsMap || {});
  const formatApproversDisplay = window.formatApproversDisplay || (() => '-');
  const formatRequestedReviewersDisplay = window.formatRequestedReviewersDisplay || (() => '-');
  const formatAssignedUsersDisplay = window.formatAssignedUsersDisplay || (() => '-');
  const normalizeRowMetrics = window.normalizeRowMetrics || (() => ({}));
  const getOpenConversationCountWithMe = window.getOpenConversationCountWithMe || (() => ({ count: 0, isViewerSpecific: false }));
  const toCount = window.toCount || ((value) => Number.parseInt(value, 10) || 0);
  const getViewedFilesSummary =
    window.getViewedFilesSummary || ((row) => `${toCount(row?.viewedFilesCount)}/${toCount(row?.changedFilesCount)} viewed`);
  const getBadgeClassForStatus = window.getBadgeClassForStatus || (() => '');
  const getBadgeClassForCheck = window.getBadgeClassForCheck || (() => '');
  const getBadgeClassForMerge = window.getBadgeClassForMerge || (() => '');
  const formatReviewFootprint = window.formatReviewFootprint || (() => '-');
  const formatConversationStatus = window.formatConversationStatus || (() => '-');
  const formatApprovalRisk = window.formatApprovalRisk || (() => '-');
  const formatCommentUsefulness = window.formatCommentUsefulness || (() => '-');

  const checkState = String(pr.checkState || parseMarkerState(pr.titleDisplay, 'CHK') || '-');
  const mergeState = String(pr.mergeState || parseMarkerState(pr.titleDisplay, 'MRG') || '-');
  const statusState = String(pr.status || '-').toUpperCase();
  const actorsMap = buildRowActorsMap(pr, actorsMapFromPayload || {});
  const metrics = normalizeRowMetrics(pr);
  const openConversationResult = getOpenConversationCountWithMe(pr);
  const openConversationCount = String(toCount(openConversationResult?.count));
  const isOpen = !String(pr.mergedAt || '').trim();

  return (
    <div className="row-insights-content" data-insights-key={compositeKey} data-pr-number={String(pr?.number || '')}>
      <div className="insight-badges">
        <span className={`insight-badge ${getBadgeClassForStatus(statusState)}`.trim()}>STATUS: {statusState}</span>
        <span className={`insight-badge ${getBadgeClassForCheck(checkState)}`.trim()}>CHK: {checkState}</span>
        <span className={`insight-badge ${getBadgeClassForMerge(mergeState)}`.trim()}>MRG: {mergeState}</span>
      </div>

      <div className="insight-grid">
        <InsightRow
          label="Source branch"
          endAdornment={<CopyIconButton text={pr.sourceBranch} label="Copy branch name" />}
        >
          {String(pr.sourceBranch || '-')}
        </InsightRow>
        <InsightRow label="Merged to">{String(pr.targetBranch || '-')}</InsightRow>
        <InsightRow label="CHK state">{checkState}</InsightRow>
        <InsightRow label="Mergeability">{mergeState}</InsightRow>
        <InsightRow label="Approvers">{formatApproversDisplay(pr, actorsMap)}</InsightRow>
        <InsightRow label="Reviewers">{formatRequestedReviewersDisplay(pr, actorsMap)}</InsightRow>
        <InsightRow label="Assigned">{formatAssignedUsersDisplay(pr, actorsMap)}</InsightRow>
        <InsightRow label={openConversationResult?.isViewerSpecific ? 'Open conversations with me' : 'Open conversations'}>
          {openConversationCount}
        </InsightRow>
        <InsightRow label="Viewed files">{getViewedFilesSummary(pr)}</InsightRow>
        <InsightRow label="Lines changed">
          <LinesChangedInsight pr={pr} />
        </InsightRow>
        <InsightRow label="Review footprint">{formatReviewFootprint(metrics)}</InsightRow>
        <InsightRow label="Conversation status">{formatConversationStatus(metrics)}</InsightRow>
        <InsightRow label="Approval risk">{formatApprovalRisk(metrics)}</InsightRow>
        <InsightRow label="Comment usefulness">{formatCommentUsefulness(metrics)}</InsightRow>
        <InsightRow label="Activity timeline">
          <ActivityTimelineSummary
            activityTimelineRaw={pr.activityTimeline}
            fallbackSummary={pr.activityTimelineSummary}
            isOpen={isOpen}
            pr={pr}
            actorsMap={actorsMap}
          />
        </InsightRow>
        <InsightRow
          label="Latest data timestamp"
          labelTitle="When source PR data (comments/reviews/threads/metadata) was last updated."
        >
          {formatIsoDatetime(pr.sourceUpdatedAt || '-')}
        </InsightRow>
        <InsightRow
          label="Last checked for updates"
          labelTitle="When this dashboard last evaluated the PR for new changes during a script run."
        >
          {formatIsoDatetime(entry?.updatedAt || '-')}
        </InsightRow>
        <InsightRow label="Baseline">{formatIsoDatetime(pr.baseline || '-')}</InsightRow>
      </div>

      <ActivityEventsSection pr={pr} actorsMap={actorsMap} />
      <ReviewThreadsSection pr={pr} actorsMap={actorsMap} />
      <ApprovalRiskSection metrics={metrics} actorsMap={actorsMap} />
      <NotesSection entry={entry} pr={pr} actorsMap={actorsMap} onDataRefresh={onDataRefresh} />
    </div>
  );
}
