/**
 * PrActionsCell - In Review / Flagged toggles plus Update, Ack, Clear, and
 * JSON-details buttons. Matches vanilla's actions-cell
 * (helpers/pr-actions-cell.helpers.js, helpers/pr-row-toggle-controls.helpers.js).
 *
 * @module components/cells/PrActionsCell
 */

import React from 'react';

export function PrActionsCell({ pr, repo, isFlagged, isInReview, onCheckboxChange, onAckAction }) {
  const entry = { prNumber: String(pr?.number || ''), repo };
  const prNumber = String(pr?.number || '');

  const handleInReviewChange = (e) => {
    onCheckboxChange?.(pr.number, 'inReview', e.target.checked, repo);
  };

  const handleFlaggedChange = (e) => {
    onCheckboxChange?.(pr.number, 'flagged', e.target.checked, repo);
  };

  const handleUpdateClick = async (e) => {
    e.stopPropagation();
    await (window.runSinglePrUpdate || (async () => {}))(entry, pr);
  };

  const handleAckClick = (e) => {
    e.stopPropagation();
    // onAckAction's `isAcked` arg means "is it currently acked" (it decides
    // ack vs. clear from that) — these are unconditional Ack/Clear buttons,
    // not a toggle, so Ack always passes false (not-currently-acked -> ack).
    onAckAction?.(pr.number, false, repo);
  };

  const handleClearClick = (e) => {
    e.stopPropagation();
    onAckAction?.(pr.number, true, repo);
  };

  const handleJsonClick = (e) => {
    e.stopPropagation();
    (window.openPrJsonModal || (() => {}))(entry, pr);
  };

  return (
    <td className="actions-cell">
      <div className="row-actions">
        <label className="in-review-control">
          <input
            type="checkbox"
            className="in-review-toggle"
            checked={isInReview}
            aria-label={`In Review for PR #${prNumber}`}
            title={isInReview ? 'In review is ON for this PR' : 'In review is OFF for this PR'}
            onChange={handleInReviewChange}
          />
          <span className="in-review-label">In Review</span>
        </label>

        <label className="in-review-control flagged-control">
          <input
            type="checkbox"
            className="in-review-toggle flagged-toggle"
            checked={isFlagged}
            aria-label={`Flagged for PR #${prNumber}`}
            title={isFlagged ? 'Flagged is ON for this PR' : 'Flagged is OFF for this PR'}
            onChange={handleFlaggedChange}
          />
          <span className="in-review-label flagged-label">Flagged</span>
        </label>

        <button type="button" className="row-action-btn update" onClick={handleUpdateClick}>
          ↻ Update
        </button>
        <button type="button" className="row-action-btn ack" onClick={handleAckClick}>
          ✓ Ack
        </button>
        <button type="button" className="row-action-btn clear" onClick={handleClearClick}>
          ✕ Clear
        </button>
        <button
          type="button"
          className="row-action-btn view-json"
          title="View PR JSON details (data + pr-details + user-state)"
          aria-label={`View PR JSON details for #${prNumber}`}
          onClick={handleJsonClick}
        >
          {'{}'}
        </button>
      </div>
    </td>
  );
}
