/**
 * PrRow - one PR's row, plus its collapsible summary row underneath
 * (PrRowSummary, opened by the chevron).
 *
 * Clicking anywhere on the row that isn't a control selects it for the
 * detail pane, and clicking the selected row again deselects it (PrTable
 * handles ↑/↓ and Esc). The selected row is marked `aria-current`.
 *
 * Memoized: only re-renders when one of its own props changes, so every
 * prop is a plain value or a stable callback (PrTableApp's handlers are
 * useStableCallback). Needs-attention reasons arrive as one
 * newline-separated string for the same reason.
 *
 * @module components/PrRow
 */

import { memo, useId, type MouseEvent } from 'react';
import type { PrData, PrEntry } from '../types/pr-data.ts';
import type { ActorsMap } from '../helpers/pr-actor-identity.helpers.ts';
import { PrSelectionCell } from './cells/PrSelectionCell';
import { PrSignalsCell } from './cells/PrSignalsCell';
import { PrTitleCell } from './cells/PrTitleCell';
import { PrWhoCell } from './cells/PrWhoCell';
import { PrReviewCell } from './cells/PrReviewCell';
import { PrChecksCell } from './cells/PrChecksCell';
import { PrActivityCell, PrSizeCell } from './cells/PrSizeActivityCells';
import { PrActionsCell, type PrActionsCellProps } from './cells/PrActionsCell';
import { PrRowSummary } from './PrRowSummary';

type PrNumber = string | number | undefined;

export interface PrRowHandlers {
  // The chevron: the row's summary.
  onToggleInsights: (prNumber: PrNumber, sectionKey: string, repo: string) => void;
  // A click on the row: select it, or deselect it if it's selected.
  onSelectRow?: (prNumber: PrNumber, repo: string) => void;
  // The summary's "Show details": show it in the pane.
  onShowDetails?: (prNumber: PrNumber, repo: string) => void;
  onCheckboxChange?: PrActionsCellProps['onCheckboxChange'];
  onAckAction?: PrActionsCellProps['onAckAction'];
  onApplyLabel?: PrActionsCellProps['onApplyLabel'];
  onUpdatePr?: PrActionsCellProps['onUpdatePr'];
  onViewJson?: PrActionsCellProps['onViewJson'];
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
  isSelected?: boolean;
  isFlagged: boolean;
  isInReview: boolean;
  isAcknowledged: boolean;
  attentionReasons: string;
  isActive: boolean;
  isQueued: boolean;
  columnCount: number;
  showSizeAndActivity: boolean;
}

// Clicks on these do their own thing, not select the row. (The Signals and
// Review cells' focusable groups aren't controls: a click there selects.)
const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="menu"]';

export const PrRow = memo(function PrRow({
  entry,
  pr,
  repo,
  sectionKey,
  isSmartGroup,
  lifecycleSection,
  actorsMap = {},
  isExpanded,
  isSelected = false,
  isFlagged,
  isInReview,
  isAcknowledged,
  attentionReasons,
  isActive,
  isQueued,
  columnCount,
  showSizeAndActivity,
  onToggleInsights,
  onSelectRow,
  onShowDetails,
  onCheckboxChange,
  onAckAction,
  onApplyLabel,
  onUpdatePr,
  onViewJson,
}: PrRowProps) {
  const lastCheckedAt = String(entry?.updatedAt || '').trim();
  const summaryId = useId();
  const reasons = attentionReasons ? attentionReasons.split('\n') : [];

  const handleClick = (event: MouseEvent<HTMLTableRowElement>) => {
    const target = event.target as Element;
    // Not when the click was on a control, or ended a text selection.
    if (target.closest(INTERACTIVE) || String(window.getSelection?.() ?? '').trim()) return;
    onSelectRow?.(pr.number, repo);
  };

  return (
    <>
      <tr
        className="pr-row"
        data-pr-number={String(pr.number ?? '')}
        data-repo={repo}
        data-section-key={sectionKey}
        data-expanded={isExpanded ? 'true' : undefined}
        aria-current={isSelected ? 'true' : undefined}
        onClick={handleClick}
      >
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
              idPrefix={summaryId}
              onShowDetails={() => onShowDetails?.(pr.number, repo)}
            />
          )}
        </td>
      </tr>
    </>
  );
});
