/**
 * PrTitleCell - Title text, lifecycle badge, target-branch note, and the
 * "More insights" / "Hide insights" toggle button. Matches vanilla's
 * title-cell (helpers/pr-title-cell.helpers.js).
 *
 * @module components/cells/PrTitleCell
 */

import React from 'react';

const LIFECYCLE_BADGES = {
  open: { text: 'Open', className: 'lifecycle-badge-open' },
  draft: { text: 'Draft', className: 'lifecycle-badge-draft' },
  closed: { text: 'Closed', className: 'lifecycle-badge-closed' },
  merged: { text: 'Merged', className: 'lifecycle-badge-merged' },
};

export function PrTitleCell({ pr, sectionKey, isSmartGroup, lifecycleSection, isExpanded, onToggleInsights }) {
  const formatTitleWithIcons = window.formatTitleWithIcons || ((_titleDisplay, title) => String(title || ''));
  const countPendingThreadComments = window.countPendingThreadComments || (() => 0);

  const badgeConfig = isSmartGroup ? LIFECYCLE_BADGES[String(lifecycleSection || '').toLowerCase()] : null;
  const targetBranch = String(pr?.targetBranch || '').trim();
  const pendingCommentCount = countPendingThreadComments(pr);

  return (
    <td className="title-cell">
      <div className="title-text">
        {formatTitleWithIcons(pr?.titleDisplay, pr?.title)}
        {badgeConfig && (
          <>
            {' '}
            <span className={`lifecycle-badge ${badgeConfig.className}`} title={`Lifecycle status: ${badgeConfig.text}`}>
              {badgeConfig.text}
            </span>
          </>
        )}
      </div>

      {targetBranch && targetBranch.toLowerCase() !== 'main' && (
        <div className="insight-subtle">Target branch: {targetBranch}</div>
      )}

      <button
        type="button"
        className="row-insights-toggle"
        aria-expanded={isExpanded ? 'true' : 'false'}
        data-pr-number={String(pr?.number || '')}
        data-section-key={String(sectionKey || '')}
        onClick={() => onToggleInsights(pr.number, sectionKey)}
      >
        {isExpanded ? 'Hide insights' : 'More insights'}
      </button>

      {pendingCommentCount > 0 && (
        <span
          className="row-pending-comments-chip"
          title="This PR has unsubmitted draft review comments that are not yet submitted."
        >
          Pending comments: {pendingCommentCount}
        </span>
      )}
    </td>
  );
}
