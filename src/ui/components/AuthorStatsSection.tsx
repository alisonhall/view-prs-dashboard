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
 * - Under a median, the slowest 1 in 10 once there are 5 or more PRs.
 * - "Their reviews of others": how many PRs they reviewed, how soon they
 *   first responded, how those reviews ended, and whose PRs they review most.
 * - "Over time": their PRs by the month opened; "By size": how long small,
 *   medium and large ones waited. Each as a table with bars.
 * - "Last 90 days" or "All time": PRs opened in the range, for the author
 *   and the team alike. The choice is kept in this browser.
 *
 * Nothing without a selected author, or when they have neither PRs nor
 * reviews stored; with none in the range, it says so beside the range switch.
 *
 * @module components/AuthorStatsSection
 */

import { useMemo, useState } from 'react';
import { usePrData } from '../state/PrDataContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import {
  AUTHOR_STATS_RANGE_DAYS,
  authorStatsRangeStart,
  buildAuthorStats,
  formatWait,
  type AuthorReviewerCount,
  type AuthorStatSource,
  type AuthorStatsRange,
} from '../helpers/author-stats.helpers.ts';
import { AuthorPrLinkRow, authorPrRowKey } from './AuthorPrLinkRow';
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
  slowest: '1 in 10 of these PRs took longer than this (shown with 5 or more PRs), so a few stuck PRs don\'t hide behind a good median.',
  given: 'Other people\'s PRs they reviewed (any review counts, once per PR), opened in the range.',
  firstResponse:
    'The median time from a PR being ready for review to their first review of it, over the other people\'s PRs they reviewed. Not from when they were asked, which isn\'t stored.',
  reviewsMostFor: 'Whose PRs they reviewed the most (once per PR).',
  months: 'Their PRs by the month they were opened: how many, and the median wait for a first review and to merge.',
  bySize: 'Their PRs by lines added plus deleted: the median wait for a first review and to merge for each size.',
};

interface StatCardProps {
  label: string;
  explanation: string;
  value: string;
  detail: string;
  team?: string;
  // The slowest 1 in 10, formatted.
  slowest?: string;
  sources: AuthorStatSource[];
  formatSource: (value: number) => string;
}

function StatCard({ label, explanation, value, detail, team, slowest, sources, formatSource }: StatCardProps) {
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
      {slowest && (
        <Tooltip content={AUTHOR_STATS_EXPLANATIONS.slowest} focusTarget>
          <span className="stat-card-detail author-stats-slowest">1 in 10 over {slowest}</span>
        </Tooltip>
      )}
      {sources.length > 0 && (
        <details className="stats-sources author-stats-sources">
          <summary>Show PRs ({sources.length})</summary>
          <ul className="author-stats-source-list">
            {sources.map((source) => (
              <AuthorPrLinkRow key={authorPrRowKey(source.entry)} entry={source.entry} detail={formatSource(source.value)} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// People with a count each (top reviewers, whose PRs they review), each
// opening on Authors.
function PeopleCard({ label, explanation, people, empty }: { label: string; explanation: string; people: AuthorReviewerCount[]; empty: string }) {
  const { payload } = usePrData();
  const { resolveActorDisplayName, loginOfActorKey, getEffectiveViewerKey, normalizeActorLogin } = useActorIdentity();
  const actorsMap = payload?.actorsMap || {};
  const viewerKey = getEffectiveViewerKey({});
  return (
    <div className="stat-card" role="group" aria-label={label}>
      <Tooltip content={explanation} focusTarget>
        <span className="stats-explained stat-card-label">{label}</span>
      </Tooltip>
      {people.length === 0 ? (
        <span className="stat-card-detail">{empty}</span>
      ) : (
        <ul className="author-stats-reviewers">
          {people.map(({ login: key, prs }) => {
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
  );
}

interface BarRow {
  label: string;
  prs: number;
  firstReviewMs: number | null;
  mergeMs: number | null;
}

// A wait with a bar as long as its share of the column's longest.
function WaitBar({ value, longest }: { value: number | null; longest: number }) {
  if (value === null) return <span className="author-stats-bar-empty">-</span>;
  const width = longest > 0 ? Math.max(2, (value / longest) * 100) : 0;
  return (
    <span className="author-stats-bar-cell">
      <span className="author-stats-bar" aria-hidden="true">
        <span className="author-stats-bar-fill" style={{ width: `${width}%` }} />
      </span>
      <span className="author-stats-bar-value">{formatWait(value)}</span>
    </span>
  );
}

function BarsTable({
  title,
  explanation,
  firstColumn,
  rows,
  empty,
}: {
  title: string;
  explanation: string;
  firstColumn: string;
  rows: BarRow[];
  empty: string;
}) {
  const longest = (pick: (row: BarRow) => number | null) => Math.max(0, ...rows.map(pick).filter((value): value is number => value !== null));
  const longestFirstReview = longest((row) => row.firstReviewMs);
  const longestMerge = longest((row) => row.mergeMs);
  return (
    <div className="stat-card author-stats-table-card" role="group" aria-label={title}>
      <Tooltip content={explanation} focusTarget>
        <span className="stats-explained stat-card-label">{title}</span>
      </Tooltip>
      {rows.length === 0 ? (
        <span className="stat-card-detail">{empty}</span>
      ) : (
      <table className="author-stats-table">
        <thead>
          <tr>
            <th scope="col">{firstColumn}</th>
            <th scope="col">PRs</th>
            <th scope="col">First review</th>
            <th scope="col">Time to merge</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.prs}</td>
              <td>
                <WaitBar value={row.firstReviewMs} longest={longestFirstReview} />
              </td>
              <td>
                <WaitBar value={row.mergeMs} longest={longestMerge} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  );
}

const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' });
const formatMonth = (month: string) => {
  const [year, monthNumber] = month.split('-').map(Number);
  return MONTH_FORMAT.format(new Date(year ?? 1970, (monthNumber ?? 1) - 1, 1));
};

export function AuthorStatsSection() {
  const { payload, selectedAuthorLogin } = usePrData();
  const { getPreferredActorKey } = useActorIdentity();
  const [range, setRange] = useState<AuthorStatsRange>(readStoredRange);
  const rows = useMemo(() => Object.values(payload?.byPrNumber || {}), [payload]);
  // Any of their PRs, or a review of someone else's, stored at all.
  const hasAnything = useMemo(
    () =>
      rows.some((entry) => {
        const data = entry?.data || {};
        if (getPreferredActorKey(data.authorLogin, data.author) === selectedAuthorLogin) return true;
        return (Array.isArray(data.reviews) ? data.reviews : []).some(
          (review) => getPreferredActorKey(review?.authorLogin, review?.authorName) === selectedAuthorLogin,
        );
      }),
    [rows, selectedAuthorLogin, getPreferredActorKey],
  );
  const stats = useMemo(
    () => buildAuthorStats(rows, selectedAuthorLogin, getPreferredActorKey, { since: authorStatsRangeStart(range, Date.now()) }),
    [rows, selectedAuthorLogin, getPreferredActorKey, range],
  );

  if (!selectedAuthorLogin || !hasAnything) {
    return null;
  }

  const pickRange = (next: AuthorStatsRange) => {
    setRange(next);
    storeRange(next);
  };
  const { team, p90, given } = stats;
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
            slowest={p90.firstReviewMs === null ? undefined : formatWait(p90.firstReviewMs)}
            sources={stats.sources.firstReview}
            formatSource={formatWait}
          />
          <StatCard
            label="Time to merge"
            explanation={AUTHOR_STATS_EXPLANATIONS.merge}
            value={stats.mergeMs === null ? '-' : formatWait(stats.mergeMs)}
            detail={stats.mergedPrs ? `median, over ${plural(stats.mergedPrs, 'merged PR')}` : 'No merged PRs yet'}
            team={team.mergeMs === null ? undefined : formatWait(team.mergeMs)}
            slowest={p90.mergeMs === null ? undefined : formatWait(p90.mergeMs)}
            sources={stats.sources.merge}
            formatSource={formatWait}
          />
          <StatCard
            label="Size"
            explanation={AUTHOR_STATS_EXPLANATIONS.size}
            value={stats.size === null ? '-' : formatLines(stats.size)}
            detail={stats.sizedPrs ? `median, over ${plural(stats.sizedPrs, 'PR')}` : 'No sizes known yet'}
            team={team.size === null ? undefined : formatLines(team.size)}
            slowest={p90.size === null ? undefined : formatLines(p90.size)}
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
          <PeopleCard
            label="Reviewed most by"
            explanation={AUTHOR_STATS_EXPLANATIONS.reviewers}
            people={stats.topReviewers}
            empty="No reviews yet"
          />
        </div>
      )}
      {stats.prs > 0 && (
        <div className="author-stats-tables">
          <BarsTable
            title="Over time"
            explanation={AUTHOR_STATS_EXPLANATIONS.months}
            firstColumn="Month"
            rows={stats.months.map((month) => ({ ...month, label: formatMonth(month.month) }))}
            empty="No opening dates known"
          />
          <BarsTable title="By size" explanation={AUTHOR_STATS_EXPLANATIONS.bySize} firstColumn="Size" rows={stats.bySize} empty="" />
        </div>
      )}
      {given.prs > 0 && (
        <>
          <h4 className="author-stats-subheading">Their reviews of others</h4>
          <div className="stats-grid author-stats-grid">
            <div className="stat-card" role="group" aria-label="PRs reviewed">
              <Tooltip content={AUTHOR_STATS_EXPLANATIONS.given} focusTarget>
                <span className="stats-explained stat-card-label">PRs reviewed</span>
              </Tooltip>
              <span className="stat-card-value">{given.prs}</span>
              <span className="stat-card-detail">
                approved {given.approvedPrs}, asked for changes on {given.changesRequestedPrs}
              </span>
            </div>
            <StatCard
              label="First response"
              explanation={AUTHOR_STATS_EXPLANATIONS.firstResponse}
              value={given.firstResponseMs === null ? '-' : formatWait(given.firstResponseMs)}
              detail={given.firstResponsePrs ? `median, over ${plural(given.firstResponsePrs, 'PR')}` : 'No times known'}
              team={team.firstReviewMs === null ? undefined : formatWait(team.firstReviewMs)}
              slowest={given.firstResponseP90 === null ? undefined : formatWait(given.firstResponseP90)}
              sources={given.sources}
              formatSource={formatWait}
            />
            <PeopleCard
              label="Reviews most for"
              explanation={AUTHOR_STATS_EXPLANATIONS.reviewsMostFor}
              people={given.topAuthors}
              empty="No one yet"
            />
          </div>
        </>
      )}
    </section>
  );
}
