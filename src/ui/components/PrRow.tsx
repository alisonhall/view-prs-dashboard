/**
 * PrRow - one PR's row, plus two collapsible rows underneath: its summary
 * (PrRowSummary, opened by the chevron), and the full insights, opened from
 * the summary's "Show details" until phase 4 moves them to the detail pane.
 *
 * Memoized: only re-renders when one of its own props changes, so every
 * prop is a plain value or a stable callback (PrTableApp's handlers are
 * useStableCallback). Needs-attention reasons arrive as one
 * newline-separated string for the same reason.
 *
 * @module components/PrRow
 */

import { memo, useId } from 'react';
import type { PrData, PrDataPayload, PrEntry } from '../types/pr-data.ts';
import type { ActorsMap } from '../helpers/pr-actor-identity.helpers.ts';
import { PrSelectionCell } from './cells/PrSelectionCell';
import { PrSignalsCell } from './cells/PrSignalsCell';
import { PrTitleCell } from './cells/PrTitleCell';
import { PrWhoCell } from './cells/PrWhoCell';
import { PrReviewCell } from './cells/PrReviewCell';
import { PrChecksCell } from './cells/PrChecksCell';
import { PrActivityCell, PrSizeCell } from './cells/PrSizeActivityCells';
import { PrActionsCell, type PrActionsCellProps } from './cells/PrActionsCell';
import { PrInsightsRow } from './PrInsightsRow';
import { PrRowSummary } from './PrRowSummary';
import { buildExpandedInsightsKey } from './pr-row-keys';

export interface PrRowHandlers {
  // The chevron: the row's summary.
  onToggleInsights: (prNumber: string | number | undefined, sectionKey: string, repo: string) => void;
  // The summary's "Show details": the full insights.
  onToggleDetails?: (prNumber: string | number | undefined, sectionKey: string, repo: string) => void;
  onCheckboxChange?: PrActionsCellProps['onCheckboxChange'];
  onAckAction?: PrActionsCellProps['onAckAction'];
  onApplyLabel?: PrActionsCellProps['onApplyLabel'];
  onUpdatePr?: PrActionsCellProps['onUpdatePr'];
  onViewJson?: PrActionsCellProps['onViewJson'];
  onDataRefresh?: (payload: PrDataPayload) => void;
}

export interface PrRowProps extends PrRowHandlers {
  entry: PrEntry;
  pr: PrData;
  repo: string;
  sectionKey: string;
  isSmartGroup?: boolean;
  lifecycleSection?: string;
  actorsMap?: ActorsMap;
  isExpanded: boolean;
  isDetailsOpen: boolean;
  isFlagged: boolean;
  isInReview: boolean;
  isAcknowledged: boolean;
  attentionReasons: string;
  isActive: boolean;
  isQueued: boolean;
  columnCount: number;
  showSizeAndActivity: boolean;
}

export const PrRow = memo(function PrRow({
  entry,
  pr,
  repo,
  sectionKey,
  isSmartGroup,
  lifecycleSection,
  actorsMap = {},
  isExpanded,
  isDetailsOpen,
  isFlagged,
  isInReview,
  isAcknowledged,
  attentionReasons,
  isActive,
  isQueued,
  columnCount,
  showSizeAndActivity,
  onToggleInsights,
  onToggleDetails,
  onCheckboxChange,
  onAckAction,
  onApplyLabel,
  onUpdatePr,
  onViewJson,
  onDataRefresh,
}: PrRowProps) {
  const compositeKey = buildExpandedInsightsKey(sectionKey, repo, pr.number ?? '');
  const lastCheckedAt = String(entry?.updatedAt || '').trim();
  const detailsId = useId();
  const reasons = attentionReasons ? attentionReasons.split('\n') : [];
  const showDetails = isExpanded && isDetailsOpen;

  return (
    <>
      <tr className="pr-row" data-pr-number={String(pr.number ?? '')} data-section-key={sectionKey} data-expanded={isExpanded ? 'true' : undefined}>
        <PrSelectionCell pr={pr} />
        <PrSignalsCell
          pr={pr}
          attentionReasons={reasons}
          isFlagged={isFlagged}
          isInReview={isInReview}
        />
        <PrTitleCell
          pr={pr}
          repo={repo}
          sectionKey={sectionKey}
          isSmartGroup={isSmartGroup}
          lifecycleSection={lifecycleSection}
          isExpanded={isExpanded}
          isActive={isActive}
          isQueued={isQueued}
          onToggleInsights={onToggleInsights}
        />
        <PrWhoCell pr={pr} actorsMap={actorsMap} />
        <PrReviewCell entry={entry} pr={pr} actorsMap={actorsMap} />
        <PrChecksCell pr={pr} />
        {showSizeAndActivity && <PrSizeCell pr={pr} />}
        {showSizeAndActivity && (
          // Staleness depends on the PR's own lifecycle section, not the
          // smart group it's shown in.
          <PrActivityCell pr={pr} lastCheckedAt={lastCheckedAt} sectionKey={lifecycleSection || sectionKey} />
        )}
        <PrActionsCell
          pr={pr}
          repo={repo}
          isFlagged={isFlagged}
          isInReview={isInReview}
          isAcknowledged={isAcknowledged}
          onCheckboxChange={onCheckboxChange}
          onAckAction={onAckAction}
          onApplyLabel={onApplyLabel}
          onUpdatePr={onUpdatePr}
          onViewJson={onViewJson}
        />
      </tr>

      <tr className="pr-summary-row" hidden={!isExpanded} aria-label={`Summary for PR #${pr.number}`}>
        <td className="pr-summary-cell" colSpan={columnCount}>
          {isExpanded && (
            <PrRowSummary
              pr={pr}
              attentionReasons={reasons}
              isFlagged={isFlagged}
              isInReview={isInReview}
              actorsMap={actorsMap}
              isDetailsOpen={isDetailsOpen}
              detailsId={detailsId}
              onToggleDetails={() => onToggleDetails?.(pr.number, sectionKey, repo)}
            />
          )}
        </td>
      </tr>

      <tr id={detailsId} className="insights-row" hidden={!showDetails} aria-label={`Insights for PR #${pr.number}`}>
        <td className="insights-row-cell" colSpan={columnCount}>
          {showDetails && (
            <PrInsightsRow entry={entry} pr={pr} actorsMap={actorsMap} compositeKey={compositeKey} onDataRefresh={onDataRefresh} />
          )}
        </td>
      </tr>
    </>
  );
});
