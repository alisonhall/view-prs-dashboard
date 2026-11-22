/**
 * AuthorStatsSection - the Authors view's stats for the selected author,
 * from their stored PRs (buildAuthorStats): the median wait for a first
 * review and to merge, the median size, how often reviewers asked for
 * changes, and who reviewed them most (each opens on Authors).
 *
 * - Each card's label says how it's worked out on hover and focus.
 * - Under each number, the same across every author's PRs ("Team: 6h"),
 *   so it says whether that's fast or slow.
 * - "Show PRs" lists the PRs behind the number, longest wait (or biggest)
 *   first, each with its value and View in table.
 * - "Last 90 days" or "All time": PRs opened in the range, for the author
 *   and the team alike. The choice is kept in this browser.
 *
 * Nothing without a selected author, or when they have no stored PRs at
 * all; with none in the range, it says so beside the range switch.
 *
 * @module components/AuthorStatsSection
 */

import { useMemo, useState } from 'react';
import { usePrData } from '../state/PrDataContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { useNavigateToPrInTable } from '../state/useNavigateToPrInTable';
import { useRowRepoName } from '../state/RowRepoNamesContext';
import {
  AUTHOR_STATS_RANGE_DAYS,
  authorStatsRangeStart,
  buildAuthorStats,
  formatWait,
  type AuthorStatSource,
  type AuthorStatsRange,
} from '../helpers/author-stats.helpers.ts';
import { createPrUserInitialsHelpers } from '../helpers/pr-user-initials.helpers.ts';
import { AuthorLink } from './AuthorLink';
import { Avatar } from './ui/Avatar';
import { Chip, ChipGroup } from './ui/Chip';
import { Tooltip } from './ui/Tooltip';

const { getUserInitials } = createPrUserInitialsHelpers();

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const formatLines = (lines: number) => `${Math.round(lines).toLocaleString()} lines`;
const formatShare = (part: number) => `${Math.round(part * 100)}%`;

export const AUTHOR_STATS_RANGE_STORAGE_KEY = 'view-prs.author-stats-range';

const readStoredRange = (): AuthorStatsRange => {
  try {
    return window.localStorage.getItem(AUTHOR_STATS_RANGE_STORAGE_KEY) === 'all' ? 'all' : '90d';
  } catch {
    return '90d';
  }
};

const storeRange = (range: AuthorStatsRange) => {
  try {
    window.localStorage.setItem(AUTHOR_STATS_RANGE_STORAGE_KEY, range);
  } catch {
    // Not kept (storage blocked): the choice still applies until a reload.
  }
};

export const AUTHOR_STATS_EXPLANATIONS = {
  firstReview:
    'The median time from a PR being opened to its first review by someone else (a comment, approval or change request; bots such as Copilot left out), over their PRs that have one. A PR opened as a draft waits from when it was marked ready for review.',
  merge: 'The median time from a PR being opened to it being merged, over their merged PRs.',
  size: 'The median lines added plus lines deleted, over their PRs whose size is known.',
  changesRequested: 'How many of their reviewed PRs had at least one "changes requested" review from a person.',
  reviewers: 'Who reviewed the most of their PRs (any review counts, once per PR; bots left out).',
  team: 'The same, worked out over every author\'s PRs in the range.',
};

// One PR behind a number: `repo#N title` linking to GitHub, its value, and
// View in table.
function SourceRow({ source, format }: { source: AuthorStatSource; format: (value: number) => string }) {
  const navigateToPrInTable = useNavigateToPrInTable();
  const { entry, value } = source;
  const row = entry?.data || {};
  const prNumber = String(row.number || entry?.prNumber || '').trim();
  const repo = String(entry?.repo || '');
  const repoName = useRowRepoName(repo);
  const href = row.url || `https://github.com/${repo}/pull/${prNumber}`;
  const formatted = format(value);
  return (
    <li className="author-stats-source">
      <a className="author-stats-source-title" href={href} target="_blank" rel="noopener noreferrer">
        {repoName}#{prNumber} {String(row.title || '').trim()}
      </a>
      {formatted && <span className="author-stats-source-value">{formatted}</span>}
      <button
        type="button"
        className="ui-link-button"
        onClick={(event) => navigateToPrInTable(prNumber, { repo, from: event.currentTarget })}
      >
        View in table
      </button>
    </li>
  );
}

interface StatCardProps {
  label: string;
  explanation: string;
  value: string;
  detail: string;
  team?: string;
  sources: AuthorStatSource[];
  formatSource: (value: number) => string;
}

function StatCard({ label, explanation, value, detail, team, sources, formatSource }: StatCardProps) {
  return (
    <div className="stat-card" role="group" aria-label={label}>
      <Tooltip content={explanation} focusTarget>
        <span className="stats-explained stat-card-label">{label}</span>
      </Tooltip>
      <span className="stat-card-value">{value}</span>
      <span className="stat-card-detail">{detail}</span>
      {team && (
        <Tooltip content={AUTHOR_STATS_EXPLANATIONS.team} focusTarget>
          <span className="stat-card-detail author-stats-team">Team: {team}</span>
        </Tooltip>
      )}
      {sources.length > 0 && (
        <details className="stats-sources author-stats-sources">
          <summary>Show PRs ({sources.length})</summary>
          <ul className="author-stats-source-list">
            {sources.map((source) => (
              <SourceRow key={`${source.entry?.repo || ''}#${source.entry?.prNumber || source.entry?.data?.number}`} source={source} format={formatSource} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function AuthorStatsSection() {
  const { payload, selectedAuthorLogin } = usePrData();
  const { getPreferredActorKey, resolveActorDisplayName, loginOfActorKey, getEffectiveViewerKey, normalizeActorLogin } =
    useActorIdentity();
  const [range, setRange] = useState<AuthorStatsRange>(readStoredRange);
  const rows = useMemo(() => Object.values(payload?.byPrNumber || {}), [payload]);
  const hasAnyPr = useMemo(
    () => rows.some((entry) => getPreferredActorKey(entry?.data?.authorLogin, entry?.data?.author) === selectedAuthorLogin),
    [rows, selectedAuthorLogin, getPreferredActorKey],
  );
  const stats = useMemo(
    () => buildAuthorStats(rows, selectedAuthorLogin, getPreferredActorKey, { since: authorStatsRangeStart(range, Date.now()) }),
    [rows, selectedAuthorLogin, getPreferredActorKey, range],
  );

  if (!selectedAuthorLogin || !hasAnyPr) {
    return null;
  }

  const pickRange = (next: AuthorStatsRange) => {
    setRange(next);
    storeRange(next);
  };
  const actorsMap = payload?.actorsMap || {};
  const viewerKey = getEffectiveViewerKey({});
  const { team } = stats;
  const changesShare = stats.reviewedPrs ? stats.changesRequestedPrs / stats.reviewedPrs : null;
  const rangeWords = range === 'all' ? 'stored' : `opened in the last ${AUTHOR_STATS_RANGE_DAYS} days`;

  return (
    <section className="author-insights-section author-stats" aria-label="Stats">
      <div className="author-stats-heading">
        <h3>{stats.prs ? `Across their ${plural(stats.prs, 'PR')} ${rangeWords}` : `No PRs ${rangeWords}`}</h3>
        <ChipGroup label="Time range">
          <Chip pressed={range === '90d'} onClick={() => pickRange('90d')}>
            Last {AUTHOR_STATS_RANGE_DAYS} days
          </Chip>
          <Chip pressed={range === 'all'} onClick={() => pickRange('all')}>
            All time
          </Chip>
        </ChipGroup>
      </div>
      {stats.prs > 0 && (
        <div className="stats-grid author-stats-grid">
          <StatCard
            label="First review"
            explanation={AUTHOR_STATS_EXPLANATIONS.firstReview}
            value={stats.firstReviewMs === null ? '-' : formatWait(stats.firstReviewMs)}
            detail={stats.firstReviewPrs ? `median, over ${plural(stats.firstReviewPrs, 'PR')}` : 'No reviewed PRs yet'}
            team={team.firstReviewMs === null ? undefined : formatWait(team.firstReviewMs)}
            sources={stats.sources.firstReview}
            formatSource={formatWait}
          />
          <StatCard
            label="Time to merge"
            explanation={AUTHOR_STATS_EXPLANATIONS.merge}
            value={stats.mergeMs === null ? '-' : formatWait(stats.mergeMs)}
            detail={stats.mergedPrs ? `median, over ${plural(stats.mergedPrs, 'merged PR')}` : 'No merged PRs yet'}
            team={team.mergeMs === null ? undefined : formatWait(team.mergeMs)}
            sources={stats.sources.merge}
            formatSource={formatWait}
          />
          <StatCard
            label="Size"
            explanation={AUTHOR_STATS_EXPLANATIONS.size}
            value={stats.size === null ? '-' : formatLines(stats.size)}
            detail={stats.sizedPrs ? `median, over ${plural(stats.sizedPrs, 'PR')}` : 'No sizes known yet'}
            team={team.size === null ? undefined : formatLines(team.size)}
            sources={stats.sources.size}
            formatSource={formatLines}
          />
          <StatCard
            label="Changes requested"
            explanation={AUTHOR_STATS_EXPLANATIONS.changesRequested}
            value={changesShare === null ? '-' : formatShare(changesShare)}
            detail={stats.reviewedPrs ? `${stats.changesRequestedPrs} of ${plural(stats.reviewedPrs, 'reviewed PR')}` : 'No reviewed PRs yet'}
            team={team.changesRequestedShare === null ? undefined : formatShare(team.changesRequestedShare)}
            sources={stats.sources.changesRequested}
            formatSource={() => ''}
          />
          <div className="stat-card" role="group" aria-label="Reviewed most by">
            <Tooltip content={AUTHOR_STATS_EXPLANATIONS.reviewers} focusTarget>
              <span className="stats-explained stat-card-label">Reviewed most by</span>
            </Tooltip>
            {stats.topReviewers.length === 0 ? (
              <span className="stat-card-detail">No reviews yet</span>
            ) : (
              <ul className="author-stats-reviewers">
                {stats.topReviewers.map(({ login: key, prs }) => {
                  const login = loginOfActorKey(key);
                  const name = resolveActorDisplayName(key, actorsMap) || login;
                  const isViewer = Boolean(viewerKey) && normalizeActorLogin(key).toLowerCase() === viewerKey;
                  return (
                    <li key={key}>
                      <AuthorLink login={key} fallbackName={name} className="author-stats-reviewer">
                        <Avatar initials={getUserInitials(name, login)} login={login} isViewer={isViewer} size="sm" />
                        <span>{name}</span>
                      </AuthorLink>
                      <span className="author-stats-reviewer-count">{plural(prs, 'PR')}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
