import type { PrData } from '../../types/pr-data.ts';
import { CopyIconButton } from '../CopyIconButton';
import { Icon, type IconName } from '../ui/Icon';
import { Signal } from '../ui/Signal';
import { createPrStatusDisplayHelpers } from '../../helpers/pr-status-display.helpers.ts';
import { createPrFormattingHelpers } from '../../helpers/pr-formatting.helpers.ts';
import { countPendingThreadComments } from '../../helpers/pr-thread-comments.helpers.ts';
import { getLabelName } from '../../helpers/pr-filter-label-extraction.helpers.ts';

const { formatTitleWithIcons } = createPrStatusDisplayHelpers();
const { escapeHtml } = createPrFormattingHelpers();

// In smart groups, which mix lifecycle states, each row shows its state.
const LIFECYCLE_SIGNALS: Record<string, { icon: IconName; tone: 'success' | 'muted' | 'danger' | 'accent'; label: string }> = {
  open: { icon: 'pr', tone: 'success', label: 'Open' },
  draft: { icon: 'prDraft', tone: 'muted', label: 'Draft' },
  closed: { icon: 'prClosed', tone: 'danger', label: 'Closed' },
  merged: { icon: 'merge', tone: 'accent', label: 'Merged' },
};

// A stable colour per label name, from a small palette (pr-table.css).
const labelHue = (label: string) => [...label].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;

/**
 * The Pull request column. The title wraps rather than being cut off, and
 * is followed by:
 * - the #number link
 * - a busy indicator while the PR is refreshing or queued
 * - a copy button (on row hover/focus)
 * - the label chips
 *
 * A second line holds a non-main target branch, unsubmitted pending
 * comments, and "update queued". The chevron opens the row's summary
 * (PrRowSummary). The cell carries
 * data-pr-number / data-repo and the .pr-link class, which "Jump to PR"
 * looks for.
 */
export interface PrTitleCellProps {
  pr: PrData;
  repo: string;
  sectionKey: string;
  isSmartGroup?: boolean;
  lifecycleSection?: string;
  isExpanded: boolean;
  isActive?: boolean;
  isQueued?: boolean;
  onToggleInsights: (prNumber: string | number | undefined, sectionKey: string, repo: string) => void;
}

export function PrTitleCell({
  pr,
  repo,
  sectionKey,
  isSmartGroup = false,
  lifecycleSection,
  isExpanded,
  isActive = false,
  isQueued = false,
  onToggleInsights,
}: PrTitleCellProps) {
  const prNumber = String(pr?.number || '');
  const title = formatTitleWithIcons(pr?.titleDisplay, pr?.title);
  const plainTitle = String(pr?.title || '').trim();
  const url = pr?.url || `https://github.com/${repo || ''}/pull/${prNumber}`;
  const lifecycle = isSmartGroup ? LIFECYCLE_SIGNALS[String(lifecycleSection || '').toLowerCase()] : undefined;
  const labels = (Array.isArray(pr?.labels) ? pr.labels : []).map((label) => getLabelName(label)).filter(Boolean);
  const targetBranch = String(pr?.targetBranch || '').trim();
  const showTargetBranch = Boolean(targetBranch) && targetBranch.toLowerCase() !== 'main';
  const pendingCommentCount = countPendingThreadComments(pr);
  const hasMeta = showTargetBranch || pendingCommentCount > 0 || Boolean(pr?.updatePending);

  return (
    <td className="pr-cell pr-cell-title" data-pr-number={prNumber} data-repo={repo || ''}>
      {/* The same layout however much fits: the chevron in a column of its
          own; beside it the PR number (its link) starting the first line, so
          it's in the same place on every row, followed by the state, any
          busy indicator and the labels; then the title wrapping under it. */}
      <div className="pr-title-cell">
        <button
          type="button"
          className="ui-icon-button pr-expand-toggle"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Hide summary' : 'Show summary'} for PR #${prNumber}`}
          onClick={() => onToggleInsights(pr?.number, sectionKey, repo)}
        >
          <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={14} />
        </button>
        <div className="pr-title-body">
          <div className="pr-title-number-line">
            <a className="pr-link" href={url} target="_blank" rel="noopener noreferrer">
              #{prNumber}
            </a>
            {lifecycle && <Signal icon={lifecycle.icon} tone={lifecycle.tone} label={lifecycle.label} />}
            {isActive ? (
              <span className="pr-busy" data-busy="active">
                <Signal icon="refresh" tone="pending" label={`PR #${prNumber} update in progress`} size={14} />
              </span>
            ) : isQueued ? (
              <span className="pr-busy" data-busy="queued">
                <Signal icon="checksPending" tone="muted" label={`PR #${prNumber} queued for update`} size={14} />
              </span>
            ) : null}
            {labels.length > 0 && (
              <div className="pr-title-labels">
                {labels.map((label, index) => (
                  <span key={`${label}-${index}`} className="pr-label" data-hue={labelHue(label)}>
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="pr-title-line">
            <span className="pr-title-text">{title}</span>
            <CopyIconButton
              className="pr-copy-title"
              text={plainTitle ? `${plainTitle} #${prNumber}` : ''}
              html={plainTitle ? `${escapeHtml(plainTitle)} <a href="${escapeHtml(url)}">#${escapeHtml(prNumber)}</a>` : ''}
              label="Copy PR title and link"
            />
          </div>
          {hasMeta && (
            <div className="pr-title-meta">
              {showTargetBranch && (
                <span>
                  Target branch: <code>{targetBranch}</code>
                </span>
              )}
              {pendingCommentCount > 0 && (
                <span
                  className="pr-meta-chip"
                  data-tone="attention"
                  title="Unsubmitted draft review comments"
                >
                  <Icon name="pencil" size={12} />
                  {pendingCommentCount} pending comment{pendingCommentCount === 1 ? '' : 's'}
                </span>
              )}
              {pr?.updatePending && (
                <span className="pr-meta-chip" title="A change was detected on GitHub; full details are queued to refresh.">
                  <Icon name="refresh" size={12} />
                  Update queued
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </td>
  );
}
