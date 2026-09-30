/**
 * PrAttentionCell - Needs-attention / flagged icon cell.
 * Matches vanilla's attention-cell (components/pr-section-table.component.js).
 *
 * @module components/cells/PrAttentionCell
 */

import { countPendingThreadComments } from '../../helpers/pr-thread-comments.helpers.js';

export function PrAttentionCell({ pr, needsAttention, isFlagged }) {
  const hasPendingComments = countPendingThreadComments(pr) > 0;

  if (!needsAttention && !isFlagged) {
    return <td className="attention-cell" />;
  }

  return (
    <td className="attention-cell">
      <div className="attention-icons">
        {needsAttention && (
          <span
            className="attention-icon"
            title={hasPendingComments ? 'Needs attention — has unsubmitted pending comments' : 'Needs attention'}
          >
            ⚠️
          </span>
        )}
        {isFlagged && (
          <span className="flagged-icon" title="PR was flagged">
            🚩
          </span>
        )}
      </div>
    </td>
  );
}
