/**
 * PrTitleCell - Title text, lifecycle badge, target-branch note, and the
 * "More insights" / "Hide insights" toggle button. Matches vanilla's
 * title-cell (helpers/pr-title-cell.helpers.js).
 *
 * @module components/cells/PrTitleCell
 */

import { CopyIconButton } from '../CopyIconButton';

const LIFECYCLE_BADGES = {
  open: { text: 'Open', className: 'lifecycle-badge-open' },
  draft: { text: 'Draft', className: 'lifecycle-badge-draft' },
  closed: { text: 'Closed', className: 'lifecycle-badge-closed' },
  merged: { text: 'Merged', className: 'lifecycle-badge-merged' },
};

export function PrTitleCell({ pr, repo, sectionKey, isSmartGroup, lifecycleSection, isExpanded, onToggleInsights }) {
  const formatTitleWithIcons = window.formatTitleWithIcons || ((_titleDisplay, title) => String(title || ''));
  const countPendingThreadComments = window.countPendingThreadComments || (() => 0);
  const escapeHtml = window.escapeHtml || ((value) => String(value ?? ''));

  const badgeConfig = isSmartGroup ? LIFECYCLE_BADGES[String(lifecycleSection || '').toLowerCase()] : null;
  const targetBranch = String(pr?.targetBranch || '').trim();
  const pendingCommentCount = countPendingThreadComments(pr);

  const prNumber = pr?.number || '';
  const prTitle = String(pr?.title || '').trim();
  const prUrl = pr?.url || `https://github.com/${repo || ''}/pull/${prNumber}`;
  const copyPlainText = prTitle ? `${prTitle} #${prNumber}` : '';
  const copyHtmlText = prTitle
    ? `${escapeHtml(prTitle)} <a href="${escapeHtml(prUrl)}">#${escapeHtml(String(prNumber))}</a>`
    : '';

  return (
    <td className="title-cell">
      <div className="title-text">
        {formatTitleWithIcons(pr?.titleDisplay, pr?.title)}
        <CopyIconButton
          text={copyPlainText}
          html={copyHtmlText}
          label="Copy PR title and link"
        />
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
        onClick={() => onToggleInsights(pr.number, sectionKey, repo)}
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
