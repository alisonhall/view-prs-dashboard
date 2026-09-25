/**
 * PrAttentionCell - Needs-attention / flagged icon cell.
 * Matches vanilla's attention-cell (components/pr-section-table.component.js).
 *
 * @module components/cells/PrAttentionCell
 */


export function PrAttentionCell({ pr, needsAttention, isFlagged }) {
  const hasPendingComments =
    (window.countPendingThreadComments ? window.countPendingThreadComments(pr) : 0) > 0;

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
