/**
 * AuthorCreatedPrsSection - React-owned "PRs created by this author"
 * section for the Author Insights tab.
 *
 * Track C (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md): reads
 * `payload`/`selectedAuthorLogin` straight from PrDataContext instead of
 * being pushed props via window.updateAuthorInsightsCreatedPrs (deleted) -
 * `selectedAuthorLogin` is kept in sync by AuthorInsightsSelector.tsx
 * (Phase H.17, see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
 * cluster 2 - previously pr-author-insights.component.js's
 * renderAuthorInsights, deleted outright that phase), the single place
 * that decides which author is selected (including its
 * auto-select-first-author fallback).
 *
 * getPreferredActorKey comes from useActorIdentity() (see
 * state/ActorIdentityContext.tsx); sortAuthorInsightsCreatedPrsDesc comes
 * from useAuthorInsights() (Phase 7, sub-phase 7.0 - see
 * REACT_MIGRATION_PLAN.md).
 *
 * The PRs are grouped as Open (drafts too), Merged and Closed, each a
 * collapsible group with its count; Closed starts collapsed unless it's
 * their only group. A group shows
 * its first AUTHOR_PR_GROUP_PAGE PRs, with "Show N more" for the rest.
 *
 * Mounted once, in AppShell's #author-insights-created-prs-root.
 *
 * @module components/AuthorCreatedPrsSection
 */

import { useState } from 'react';
import { AuthorInsightsPrRow } from './AuthorInsightsPrRow';
import { usePrData } from '../state/PrDataContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { useAuthorInsights } from '../state/AuthorInsightsContext';
import { getAuthorPrState, type AuthorPrState } from '../helpers/author-picker.helpers.ts';
import type { PrEntry } from '../types/pr-data.ts';

// How many PRs a group shows before "Show N more".
export const AUTHOR_PR_GROUP_PAGE = 10;

const GROUPS: Array<{ state: AuthorPrState; title: string; open: boolean }> = [
  { state: 'open', title: 'Open', open: true },
  { state: 'merged', title: 'Merged', open: true },
  { state: 'closed', title: 'Closed', open: false },
];

function PrGroup({ title, open, entries }: { title: string; open: boolean; entries: PrEntry[] }) {
  const [shown, setShown] = useState(AUTHOR_PR_GROUP_PAGE);
  // Only how it first opens: a data update that adds or removes another
  // group doesn't fold or unfold this one under you.
  const [initiallyOpen] = useState(open);
  const more = entries.length - shown;
  return (
    <details className="author-insights-pr-group" open={initiallyOpen}>
      <summary>
        {title} <span className="author-insights-pr-group-count">{entries.length}</span>
      </summary>
      <div className="author-insights-list">
        {entries.slice(0, shown).map((entry, index) => (
          <div className="author-insights-item" key={`${entry?.repo || ''}#${entry?.prNumber || entry?.data?.number || index}`}>
            <AuthorInsightsPrRow entry={entry} />
          </div>
        ))}
      </div>
      {more > 0 && (
        <button type="button" className="ui-link-button author-insights-pr-group-more" onClick={() => setShown(entries.length)}>
          Show {more} more
        </button>
      )}
    </details>
  );
}

export function AuthorCreatedPrsSection() {
  const { payload, selectedAuthorLogin } = usePrData();
  const { getPreferredActorKey } = useActorIdentity();
  const { sortAuthorInsightsCreatedPrsDesc } = useAuthorInsights();
  const rows = Object.values(payload?.byPrNumber || {});
  const createdPrs: PrEntry[] = sortAuthorInsightsCreatedPrsDesc(
    (Array.isArray(rows) ? rows : []).filter(
      (entry) => getPreferredActorKey(entry?.data?.authorLogin, entry?.data?.author) === selectedAuthorLogin,
    ),
  );

  return (
    <section className="author-insights-section">
      <h3>PRs created by this author</h3>
      {createdPrs.length === 0 ? (
        <p className="stats-empty">No PRs by this author in the current local data scope.</p>
      ) : (
        (() => {
          const groups = GROUPS.map((group) => ({
            ...group,
            entries: createdPrs.filter((entry) => getAuthorPrState(entry) === group.state),
          })).filter((group) => group.entries.length > 0);
          // Keyed by author: a new author starts with the groups as first
          // shown. A group on its own is open, even Closed.
          return groups.map(({ state, title, open, entries }) => (
            <PrGroup key={`${selectedAuthorLogin}:${state}`} title={title} open={open || groups.length === 1} entries={entries} />
          ));
        })()
      )}
    </section>
  );
}
