/**
 * PrStatusCell - Status text, viewed-files progress, and last-checked
 * indicator. Matches vanilla's status-cell (helpers/pr-status-cell.helpers.js).
 *
 * @module components/cells/PrStatusCell
 */

import React from 'react';

export function PrStatusCell({ pr, lastCheckedAt, sectionKey }) {
  const isChangedStatus = window.isChangedStatus || (() => false);
  const statusClass = window.statusClass || (() => '');
  const getViewedFilesState =
    window.getViewedFilesState ||
    (() => ({ viewedFilesCount: 0, changedFilesCount: 0, isComplete: false, hasUnviewedFiles: false }));
  const buildPrLastCheckedIndicator = window.buildPrLastCheckedIndicator || (() => ({ label: '', title: '', isStale: false }));

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
      </div>
    </td>
  );
}
