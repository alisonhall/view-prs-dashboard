/**
 * PrActionsCell - In Review / Flagged toggles plus Update, Ack, and
 * JSON-details buttons. Matches vanilla's actions-cell
 * (helpers/pr-actions-cell.helpers.js, helpers/pr-row-toggle-controls.helpers.js).
 *
 * The Ack button is a single toggle, not a separate Ack/Clear pair: it
 * reads "Ack" and clicking it acknowledges the PR; once acknowledged it
 * reads "Ack'd" (styled as selected) and clicking it again clears the
 * acknowledgement.
 *
 * @module components/cells/PrActionsCell
 */

import React from 'react';

export function PrActionsCell({ pr, repo, isFlagged, isInReview, isAcknowledged, onCheckboxChange, onAckAction, onApplyLabel, onUpdatePr, onViewJson }) {
  const entry = { prNumber: String(pr?.number || ''), repo };
  const prNumber = String(pr?.number || '');

  const getLabelName = window.getLabelName || ((label) => String(label?.name || label || '').trim());
  const existingLabels = new Set(
    (Array.isArray(pr?.labels) ? pr.labels : []).map((label) => getLabelName(label)).filter(Boolean),
  );
  const availableLabels = ((window.getAvailableRepoLabels || (() => []))() || []).filter(
    (label) => label?.name && !existingLabels.has(label.name),
  );

  const handleApplyLabelChange = (e) => {
    const label = e.target.value;
    e.target.value = '';
    if (label) {
      onApplyLabel?.(pr.number, label, repo);
    }
  };

  const handleInReviewChange = (e) => {
    onCheckboxChange?.(pr.number, 'inReview', e.target.checked, repo);
  };

  const handleFlaggedChange = (e) => {
    onCheckboxChange?.(pr.number, 'flagged', e.target.checked, repo);
  };

  const handleUpdateClick = async (e) => {
    e.stopPropagation();
    if (onUpdatePr) {
      await onUpdatePr(pr.number, entry, pr);
    } else {
      await (window.runSinglePrUpdate || (async () => {}))(entry, pr);
    }
  };

  const handleAckToggleClick = (e) => {
    e.stopPropagation();
    // onAckAction's `isAcked` arg means "is it currently acked" (it decides
    // ack vs. clear from that) - pass the current state so the toggle flips it.
    onAckAction?.(pr.number, isAcknowledged, repo);
  };

  const handleJsonClick = (e) => {
    e.stopPropagation();
    onViewJson?.(entry, pr);
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
        <button
          type="button"
          className={isAcknowledged ? 'row-action-btn ack is-acked' : 'row-action-btn ack'}
          aria-pressed={Boolean(isAcknowledged)}
          title={isAcknowledged ? 'Acknowledged - click to clear' : 'Click to acknowledge'}
          onClick={handleAckToggleClick}
        >
          {isAcknowledged ? "✓ Ack'd" : '✓ Ack'}
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
        <select
          className="row-action-add-label"
          aria-label={`Add label to PR #${prNumber}`}
          title="Add an existing GitHub label to this PR"
          defaultValue=""
          onChange={handleApplyLabelChange}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="">+ Label</option>
          {availableLabels.map((label) => (
            <option key={label.name} value={label.name}>
              {label.name}
            </option>
          ))}
        </select>
      </div>
    </td>
  );
}
