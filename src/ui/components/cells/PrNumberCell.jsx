/**
 * PrNumberCell - PR number link cell with an update-in-progress indicator slot.
 * Matches vanilla's pr-number-cell (components/pr-section-table.component.js).
 *
 * @module components/cells/PrNumberCell
 */


export function PrNumberCell({ pr, repo, isActive = false, isQueued = false }) {
  const prNumber = pr?.number || '';
  const href = pr?.url || `https://github.com/${repo || ''}/pull/${prNumber}`;
  // "Active" (a request for this PR is actually in flight) always wins
  // visually over "queued" (part of a chunked bulk request that hasn't
  // reached the network yet) - see PrTableApp.jsx's combinedQueuedPrNumbers,
  // which already excludes anything in combinedActivePrNumbers, but this
  // guards the render itself too in case a caller ever passes both.
  const showActive = isActive;
  const showQueued = !isActive && isQueued;

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
            hidden={!showActive}
            title={`PR #${prNumber} update in progress`}
            aria-hidden="true"
          />
          <span
            className="pr-progress-indicator pr-progress-indicator--queued"
            hidden={!showQueued}
            title={`PR #${prNumber} queued for update`}
            aria-hidden="true"
          />
        </span>
      </div>
    </td>
  );
}
