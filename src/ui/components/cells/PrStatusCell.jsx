/**
 * PrStatusCell - Status text, viewed-files progress, and last-checked
 * indicator. Matches vanilla's status-cell (helpers/pr-status-cell.helpers.js).
 *
 * @module components/cells/PrStatusCell
 */

import { createPrStatusDisplayHelpers } from '../../helpers/pr-status-display.helpers.js';
import { buildPrLastCheckedIndicator } from '../../helpers/pr-last-checked-indicator.helpers.js';
import { getViewedFilesState } from '../../helpers/pr-viewed-files-state.helpers.js';

// Phase 7, sub-phase 7.0 (see REACT_MIGRATION_PLAN.md): a genuinely
// zero-dependency pure-function factory - no viewer/payload state involved,
// so this is a direct import rather than a window.* bridge or Context.
const { isChangedStatus, statusClass } = createPrStatusDisplayHelpers();

export function PrStatusCell({ pr, lastCheckedAt, sectionKey }) {
  const statusText =
    pr?.reason && pr.reason !== '-' && isChangedStatus(pr?.status)
      ? `${pr.status}(${pr.reason})`
      : pr?.status || '-';

  const viewedFilesState = getViewedFilesState(pr);
  const viewedProgressClassName = [
    'approved-viewed-progress',
    viewedFilesState.hasUnviewedFiles
      ? 'approved-viewed-progress-incomplete'
      : viewedFilesState.isComplete
        ? 'approved-viewed-progress-complete'
        : '',
  ]
    .filter(Boolean)
    .join(' ');

  const lastChecked = buildPrLastCheckedIndicator({ updatedAt: lastCheckedAt, sectionKey });
  const lastCheckedClassName = [
    'pr-last-checked-indicator',
    lastChecked.isStale ? 'pr-last-checked-indicator-stale' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <td className={['status-cell', statusClass(pr?.status)].filter(Boolean).join(' ')}>
      <div className="status-cell-content">
        <div>{statusText}</div>
        <div className="approved-cell-detail">
          <span className={viewedProgressClassName}>
            {viewedFilesState.viewedFilesCount}/{viewedFilesState.changedFilesCount}
          </span>
          <span> viewed</span>
        </div>
        <span className={lastCheckedClassName} title={lastChecked.title || undefined}>
          {lastChecked.label}
        </span>
        {pr?.updatePending ? (
          <span
            className="pr-update-pending-badge"
            title="A change was detected on GitHub; full details are queued to refresh."
          >
            Update queued
          </span>
        ) : null}
      </div>
    </td>
  );
}
