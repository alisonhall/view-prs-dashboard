import type { PrData, PrEntry } from '../../types/pr-data.ts';
import { CopyIconButton } from '../CopyIconButton';
import { Icon, type IconName } from '../ui/Icon';
import { Signal } from '../ui/Signal';
import { createPrStatusDisplayHelpers } from '../../helpers/pr-status-display.helpers.ts';
import { createPrFormattingHelpers } from '../../helpers/pr-formatting.helpers.ts';
import { countPendingThreadComments } from '../../helpers/pr-thread-comments.helpers.ts';
import { getLabelName } from '../../helpers/pr-filter-label-extraction.helpers.ts';
import { useRowRepoName } from '../../state/RowRepoNamesContext';
import { useSearchTerms } from '../../state/SearchTermsContext';
import { matchRowSearch, SEARCH_FIELD_LABELS } from '../../helpers/pr-row-search.helpers.ts';
import { describeRowRefreshProblem } from '../../helpers/pr-row-freshness.helpers.ts';
import { useNow } from '../../state/NowContext';
import { useRepoFreshness } from '../../state/RepoFreshnessContext';
import { PrLocalBranchChip } from '../LocalBranchStatus';

const { formatTitleWithIcons } = createPrStatusDisplayHelpers();
const { escapeHtml } = createPrFormattingHelpers();

// In smart groups, which mix lifecycle states, each row shows its state
// (and each PR in the Authors view, AuthorInsightsPrRow). GitHub's colours,
// as the sections by status' headers (BUILT_IN_SECTION_LOOKS): merged purple.
export const LIFECYCLE_SIGNALS: Record<string, { icon: IconName; tone: 'success' | 'muted' | 'danger' | 'done'; label: string }> = {
  open: { icon: 'pr', tone: 'success', label: 'Open' },
  draft: { icon: 'prDraft', tone: 'muted', label: 'Draft' },
  closed: { icon: 'prClosed', tone: 'danger', label: 'Closed' },
  merged: { icon: 'merge', tone: 'done', label: 'Merged' },
};

// A stable colour per label name, from a small palette (pr-table.css).
const labelHue = (label: string) => [...label].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 5;

/**
 * The Pull request column. The title wraps rather than being cut off, and
 * is followed by:
 * - the repo's name, when rows from more than one are in view
 *   (RowRepoNamesContext), in full on hover
 * - the #number link, opening GitHub in a new tab (its icon says so)
 * - a busy indicator while the PR is refreshing or queued
 * - a copy button (on row hover/focus)
 * - the label chips
 *
 * A second line holds a non-main target branch, unsubmitted pending
 * comments, "Details updating" / "No longer open" while the row's
 * details are behind GitHub, and where a search matched when the row
 * doesn't show it ("Matches in comments"). The chevron opens the row's summary
 * (PrRowSummary). The cell carries
 * data-pr-number / data-repo and the .pr-link class, which "Jump to PR"
 * looks for.
 */
export interface PrTitleCellProps {
  pr: PrData;
  // For its notes (the search's "Matches in").
  entry?: PrEntry;
  repo: string;
  sectionKey: string;
  isSmartGroup?: boolean;
  lifecycleSection?: string;
  isExpanded: boolean;
  isActive?: boolean;
  isQueued?: boolean;
  onToggleInsights: (prNumber: string | number | undefined, sectionKey: string, repo: string) => void;
  // The row's Update PR, for Retry when its last refresh failed.
  onRetry?: () => unknown;
}

/**
 * "Couldn't refresh · data from 2h ago" when the row's last refresh failed
 * (pr-row-freshness's describeRowRefreshProblem: why in its tooltip), with
 * Retry - disabled while the row is being fetched. Its own component, so
 * the clock (useNow) and what couldn't be refreshed re-render it, not the
 * title cell.
 */
function PrRefreshProblem({
  entry,
  prNumber,
  isBusy,
  onRetry,
}: {
  entry: PrEntry;
  prNumber: string;
  isBusy: boolean;
  onRetry?: () => unknown;
}) {
  const nowMs = useNow();
  const { refreshFailures, unreachablePrs } = useRepoFreshness();
  const problem = describeRowRefreshProblem({ entry, refreshFailures, unreachablePrs, nowMs });
  if (!problem) return null;
  return (
    <div className="pr-title-meta pr-refresh-problem">
      <span className="pr-meta-chip" data-tone="attention" title={problem.lines.join('\n')}>
        <Icon name="alert" size={12} />
        {problem.label}
        {problem.dataAge && ` · data from ${problem.dataAge}`}
      </span>
      {onRetry && (
        <button type="button" className="pr-refresh-retry" disabled={isBusy} aria-label={`Retry refreshing PR #${prNumber}`} onClick={() => void onRetry()}>
          Retry
        </button>
      )}
    </div>
  );
}

export function PrTitleCell({
  pr,
  entry,
  repo,
  sectionKey,
  isSmartGroup = false,
  lifecycleSection,
  isExpanded,
  isActive = false,
  isQueued = false,
  onToggleInsights,
  onRetry,
}: PrTitleCellProps) {
  const prNumber = String(pr?.number || '');
  // With rows from several repos in view, the number alone doesn't say
  // which PR this is.
  const repoName = useRowRepoName(repo);
  const title = formatTitleWithIcons(pr?.titleDisplay, pr?.title);
  const plainTitle = String(pr?.title || '').trim();
  const url = pr?.url || `https://github.com/${repo || ''}/pull/${prNumber}`;
  const lifecycle = isSmartGroup ? LIFECYCLE_SIGNALS[String(lifecycleSection || '').toLowerCase()] : undefined;
  const labels = (Array.isArray(pr?.labels) ? pr.labels : []).map((label) => getLabelName(label)).filter(Boolean);
  const targetBranch = String(pr?.targetBranch || '').trim();
  const showTargetBranch = Boolean(targetBranch) && targetBranch.toLowerCase() !== 'main';
  const pendingCommentCount = countPendingThreadComments(pr);
  // The live summary's view (pr.live, open/draft rows): a complete listing
  // no longer has it, or GitHub has activity the row's details haven't
  // caught up with (or the quick check queued it).
  const noLongerOpen = pr?.live?.stillOpen === false;
  const detailsBehind = !noLongerOpen && (Boolean(pr?.updatePending) || pr?.live?.detailsBehind === true);
  // A search word found only in what the row doesn't show (its branch
  // names, your notes): where, so it's clear why the row is here.
  const searchTerms = useSearchTerms();
  const searchHiddenFields = searchTerms.length > 0 ? matchRowSearch(entry || { data: pr }, searchTerms).hiddenFields : [];
  const hasMeta = showTargetBranch || pendingCommentCount > 0 || noLongerOpen || detailsBehind || searchHiddenFields.length > 0;

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
            {/* The repo and number together: a long repo name is cut short
                rather than pushing the number onto a line of its own. */}
            <span className="pr-title-ref">
              {repoName && (
                <span className="pr-title-repo" title={`In ${repo}`}>
                  <span aria-hidden="true">{repoName}</span>
                  <span className="ui-visually-hidden">{repo}</span>
                </span>
              )}
              <a className="pr-link" href={url} target="_blank" rel="noopener noreferrer">
                #{prNumber}
                <Icon name="externalLink" size={11} label="opens GitHub in a new tab" />
              </a>
            </span>
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
              {noLongerOpen && (
                <span
                  className="pr-meta-chip"
                  data-tone="attention"
                  title="GitHub no longer lists it as open (merged or closed since); its update is queued."
                >
                  <Icon name="refresh" size={12} />
                  No longer open
                </span>
              )}
              {detailsBehind && (
                <span
                  className="pr-meta-chip"
                  title="GitHub has newer activity. The row's summary (CI, mergeability, labels, size) is current; reviews, approvals and activity update when its queued refresh runs."
                >
                  <Icon name="refresh" size={12} />
                  Details updating
                </span>
              )}
              {searchHiddenFields.length > 0 && (
                <span className="pr-meta-chip" data-search-match="">
                  <Icon name="search" size={12} />
                  Matches in {searchHiddenFields.map((field) => SEARCH_FIELD_LABELS[field]).join(', ')}
                </span>
              )}
            </div>
          )}
          {/* This computer's copy of its branch (Settings › Local clones). */}
          <PrLocalBranchChip repo={repo} prNumber={prNumber} />
          {entry && <PrRefreshProblem entry={entry} prNumber={prNumber} isBusy={isActive || isQueued} onRetry={onRetry} />}
        </div>
      </div>
    </td>
  );
}
