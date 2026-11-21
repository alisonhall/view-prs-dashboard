/**
 * AuthorStatsSection - the Authors view's stats for the selected author,
 * from their stored PRs (buildAuthorStats): the median wait for a first
 * review and to merge, the median size, how often reviewers asked for
 * changes, and who reviewed them most (each opens on Authors). Each card's
 * label says how it's worked out on hover and focus. Nothing without a
 * selected author, or when they have no stored PRs.
 *
 * @module components/AuthorStatsSection
 */

import { useMemo } from 'react';
import { usePrData } from '../state/PrDataContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { buildAuthorStats, formatWait } from '../helpers/author-stats.helpers.ts';
import { createPrUserInitialsHelpers } from '../helpers/pr-user-initials.helpers.ts';
import { AuthorLink } from './AuthorLink';
import { Avatar } from './ui/Avatar';
import { Tooltip } from './ui/Tooltip';

const { getUserInitials } = createPrUserInitialsHelpers();

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const AUTHOR_STATS_EXPLANATIONS = {
  firstReview:
    'The median time from a PR being opened to its first review by someone else (a comment, approval or change request; bots such as Copilot left out), over their PRs that have one. A PR opened as a draft waits from when it was marked ready for review.',
  merge: 'The median time from a PR being opened to it being merged, over their merged PRs.',
  size: 'The median lines added plus lines deleted, over their PRs whose size is known.',
  changesRequested: 'How many of their reviewed PRs had at least one "changes requested" review from a person.',
  reviewers: 'Who reviewed the most of their PRs (any review counts, once per PR; bots left out).',
};

function StatCard({ label, explanation, value, detail }: { label: string; explanation: string; value: string; detail: string }) {
  return (
    <div className="stat-card" role="group" aria-label={label}>
      <Tooltip content={explanation} focusTarget>
        <span className="stats-explained stat-card-label">{label}</span>
      </Tooltip>
      <span className="stat-card-value">{value}</span>
      <span className="stat-card-detail">{detail}</span>
    </div>
  );
}

export function AuthorStatsSection() {
  const { payload, selectedAuthorLogin } = usePrData();
  const { getPreferredActorKey, resolveActorDisplayName, loginOfActorKey, getEffectiveViewerKey, normalizeActorLogin } =
    useActorIdentity();
  const stats = useMemo(
    () => buildAuthorStats(Object.values(payload?.byPrNumber || {}), selectedAuthorLogin, getPreferredActorKey),
    [payload, selectedAuthorLogin, getPreferredActorKey],
  );

  if (!selectedAuthorLogin || stats.prs === 0) {
    return null;
  }

  const actorsMap = payload?.actorsMap || {};
  const viewerKey = getEffectiveViewerKey({});
  const changesShare = stats.reviewedPrs ? Math.round((stats.changesRequestedPrs / stats.reviewedPrs) * 100) : null;

  return (
    <section className="author-insights-section author-stats" aria-label="Stats">
      <h3>Across their {plural(stats.prs, 'stored PR')}</h3>
      <div className="stats-grid author-stats-grid">
        <StatCard
          label="First review"
          explanation={AUTHOR_STATS_EXPLANATIONS.firstReview}
          value={stats.firstReviewMs === null ? '-' : formatWait(stats.firstReviewMs)}
          detail={stats.firstReviewPrs ? `median, over ${plural(stats.firstReviewPrs, 'PR')}` : 'No reviewed PRs yet'}
        />
        <StatCard
          label="Time to merge"
          explanation={AUTHOR_STATS_EXPLANATIONS.merge}
          value={stats.mergeMs === null ? '-' : formatWait(stats.mergeMs)}
          detail={stats.mergedPrs ? `median, over ${plural(stats.mergedPrs, 'merged PR')}` : 'No merged PRs yet'}
        />
        <StatCard
          label="Size"
          explanation={AUTHOR_STATS_EXPLANATIONS.size}
          value={stats.size === null ? '-' : `${Math.round(stats.size).toLocaleString()} lines`}
          detail={stats.sizedPrs ? `median, over ${plural(stats.sizedPrs, 'PR')}` : 'No sizes known yet'}
        />
        <StatCard
          label="Changes requested"
          explanation={AUTHOR_STATS_EXPLANATIONS.changesRequested}
          value={changesShare === null ? '-' : `${changesShare}%`}
          detail={stats.reviewedPrs ? `${stats.changesRequestedPrs} of ${plural(stats.reviewedPrs, 'reviewed PR')}` : 'No reviewed PRs yet'}
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
    </section>
  );
}
