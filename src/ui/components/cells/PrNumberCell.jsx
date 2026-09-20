/**
 * PrNumberCell - PR number link cell with an update-in-progress indicator slot.
 * Matches vanilla's pr-number-cell (components/pr-section-table.component.js).
 *
 * @module components/cells/PrNumberCell
 */

import React from 'react';

export function PrNumberCell({ pr, repo, isActive = false }) {
  const prNumber = pr?.number || '';
  const href = pr?.url || `https://github.com/${repo || ''}/pull/${prNumber}`;

  return (
    <td className="pr-number-cell" data-pr-number={String(prNumber)} data-repo={String(repo || '')}>
      <div className="pr-number-cell-content">
        <span className="pr-number-cell-top">
          <a className="pr-link" href={href} target="_blank" rel="noopener noreferrer">
            #{prNumber}
          </a>
        </span>
        <span className="pr-number-cell-progress">
          <span
            className="pr-progress-indicator"
            hidden={!isActive}
            title={`PR #${prNumber} update in progress`}
            aria-hidden="true"
          />
        </span>
      </div>
    </td>
  );
}
