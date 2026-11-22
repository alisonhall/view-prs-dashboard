/**
 * AuthorWaitingSection - the Authors view's "Waiting now": the selected
 * author's open PRs (drafts left out), longest waiting first, each saying
 * what it's waiting on and for how long (buildAuthorWaitingPrs): a first
 * review, the author after a change request, a reviewer after new commits,
 * a merge after approval, or an approval after a review.
 *
 * Nothing without a selected author, or when they have no stored PRs.
 *
 * @module components/AuthorWaitingSection
 */

import { useMemo } from 'react';
import { usePrData } from '../state/PrDataContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { buildAuthorWaitingPrs, type AuthorWaitingPr } from '../helpers/author-waiting.helpers.ts';
import { formatWait } from '../helpers/author-stats.helpers.ts';
import { AuthorPrLinkRow, authorPrRowKey } from './AuthorPrLinkRow';
import { Tooltip } from './ui/Tooltip';

export const describeAuthorWait = ({ reason, since }: AuthorWaitingPr, now: number): string => {
  const age = formatWait(Math.max(0, now - since));
  switch (reason) {
    case 'first-review':
      return `Waiting ${age} for a first review`;
    case 'changes-requested':
      return `Changes requested ${age} ago, no commits since`;
    case 'updated':
      return `New commits ${age} ago, after changes were requested`;
    case 'approved':
      return `Approved ${age} ago, not merged`;
    default:
      return `Reviewed ${age} ago, not approved yet`;
  }
};

const EXPLANATION =
  'Their open PRs (not drafts), longest waiting first: for a first review (from when it was ready), for them after a change request, for the reviewer after new commits, to be merged once approved, or to be approved after a review. Bots\' reviews are left out.';

export function AuthorWaitingSection() {
  const { payload, selectedAuthorLogin } = usePrData();
  const { getPreferredActorKey } = useActorIdentity();
  const rows = useMemo(() => Object.values(payload?.byPrNumber || {}), [payload]);
  const hasAnyPr = useMemo(
    () => rows.some((entry) => getPreferredActorKey(entry?.data?.authorLogin, entry?.data?.author) === selectedAuthorLogin),
    [rows, selectedAuthorLogin, getPreferredActorKey],
  );
  const waiting = useMemo(
    () => buildAuthorWaitingPrs(rows, selectedAuthorLogin, getPreferredActorKey),
    [rows, selectedAuthorLogin, getPreferredActorKey],
  );

  if (!selectedAuthorLogin || !hasAnyPr) return null;
  const now = Date.now();

  return (
    <section className="author-insights-section author-waiting" aria-label="Waiting now">
      <h3>
        <Tooltip content={EXPLANATION} focusTarget>
          <span className="stats-explained">Waiting now</span>
        </Tooltip>
        {waiting.length > 0 && <span className="author-insights-pr-group-count"> {waiting.length}</span>}
      </h3>
      {waiting.length === 0 ? (
        <p className="stats-empty">None of their PRs are open for review.</p>
      ) : (
        <ul className="author-stats-source-list author-waiting-list">
          {waiting.map((item) => (
            <AuthorPrLinkRow key={authorPrRowKey(item.entry)} entry={item.entry} detail={describeAuthorWait(item, now)} />
          ))}
        </ul>
      )}
    </section>
  );
}
