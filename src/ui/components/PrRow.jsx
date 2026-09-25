/**
 * PrRow - Individual PR row component
 *
 * Renders the full 11-column row that vanilla's pr-section-table.component.js
 * builds (Select, Attention, PR#, Status, Approved, Title, Author, Labels,
 * CHK, Date, Actions), plus a collapsible insights row below it.
 *
 * CRITICAL: This component uses React.memo() to prevent unnecessary re-renders.
 * Only updates when its specific PR data or state changes.
 *
 * @module components/PrRow
 */

import { memo } from 'react';
import { PrSelectionCell } from './cells/PrSelectionCell';
import { PrAttentionCell } from './cells/PrAttentionCell';
import { PrNumberCell } from './cells/PrNumberCell';
import { PrStatusCell } from './cells/PrStatusCell';
import { PrApprovedCell } from './cells/PrApprovedCell';
import { PrTitleCell } from './cells/PrTitleCell';
import { PrAuthorCell } from './cells/PrAuthorCell';
import { PrLabelsCell } from './cells/PrLabelsCell';
import { PrCheckCell } from './cells/PrCheckCell';
import { PrDateCell } from './cells/PrDateCell';
import { PrActionsCell } from './cells/PrActionsCell';
import { PrInsightsRow } from './PrInsightsRow';
import { buildExpandedInsightsKey } from './pr-row-keys';

/**
 * PR Row Component (Memoized)
 *
 * @param {Object} props
 * @param {Object} props.entry - The raw { prNumber, repo, section, data, updatedAt } entry
 * @param {Object} props.pr - PR data object (entry.data)
 * @param {string} props.repo
 * @param {string} props.sectionKey - Section identifier (smart group key or lifecycle key)
 * @param {boolean} props.isSmartGroup - True if in smart group
 * @param {string} props.lifecycleSection - Lifecycle status for badges
 * @param {Object} props.actorsMap
 * @param {boolean} props.isExpanded - True if insights row is expanded
 * @param {Function} props.onToggleInsights - Toggle insights callback
 * @param {Function} props.onCheckboxChange - Checkbox change callback
 * @param {Function} props.onAckAction - Ack action callback
 * @returns {JSX.Element}
 */
export const PrRow = memo(function PrRow({
  entry,
  pr,
  repo,
  sectionKey,
  isSmartGroup,
  lifecycleSection,
  actorsMap,
  isExpanded,
  isFlagged,
  isInReview,
  isAcknowledged,
  needsAttention,
  isActive,
  onToggleInsights,
  onCheckboxChange,
  onAckAction,
  onApplyLabel,
  onUpdatePr,
  onDataRefresh,
  onViewJson,
}) {
  const compositeKey = buildExpandedInsightsKey(sectionKey, repo, pr.number);
  const lastCheckedAt = String(entry?.updatedAt || '').trim() || String(pr?.updatedAt || '').trim();

  return (
    <>
      <tr className="pr-row" data-pr-number={pr.number} data-section-key={sectionKey}>
        <PrSelectionCell pr={pr} />
        <PrAttentionCell pr={pr} needsAttention={needsAttention} isFlagged={isFlagged} />
        <PrNumberCell pr={pr} repo={repo} isActive={isActive} />
        <PrStatusCell pr={pr} lastCheckedAt={lastCheckedAt} sectionKey={sectionKey} />
        <PrApprovedCell pr={pr} actorsMap={actorsMap} />
        <PrTitleCell
          pr={pr}
          repo={repo}
          sectionKey={sectionKey}
          isSmartGroup={isSmartGroup}
          lifecycleSection={lifecycleSection}
          isExpanded={isExpanded}
          onToggleInsights={onToggleInsights}
        />
        <PrAuthorCell entry={entry} pr={pr} actorsMap={actorsMap} />
        <PrLabelsCell pr={pr} />
        <PrCheckCell pr={pr} />
        <PrDateCell entry={entry} pr={pr} />
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

      <tr className="insights-row" hidden={!isExpanded}>
        <td className="insights-row-cell" colSpan={11}>
          {isExpanded && (
            <PrInsightsRow entry={entry} pr={pr} actorsMap={actorsMap} compositeKey={compositeKey} onDataRefresh={onDataRefresh} />
          )}
        </td>
      </tr>
    </>
  );
});
