/**
 * AuthorCreatedPrsSection - React-owned "PRs created by this author"
 * section for the Author Insights tab.
 *
 * Track C (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md): reads
 * `payload`/`selectedAuthorLogin` straight from PrDataContext instead of
 * being pushed props via window.updateAuthorInsightsCreatedPrs (deleted) -
 * `selectedAuthorLogin` is kept in sync by pr-author-insights.component.js's
 * renderAuthorInsights, the single place that decides which author is
 * selected (including its auto-select-first-author fallback).
 *
 * getPreferredActorKey comes from useActorIdentity() (see
 * state/ActorIdentityContext.jsx); sortAuthorInsightsCreatedPrsDesc comes
 * from useAuthorInsights() (Phase 7, sub-phase 7.0 - see
 * REACT_MIGRATION_PLAN.md).
 *
 * Mounted once into the static #author-insights-created-prs-root
 * container.
 *
 * @module components/AuthorCreatedPrsSection
 */

import { AuthorInsightsPrLink } from './AuthorInsightsPrLink';
import { AuthorInsightsPrDataMeta } from './AuthorInsightsPrDataMeta';
import { usePrData } from '../state/PrDataContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { useAuthorInsights } from '../state/AuthorInsightsContext';
import { createPrFormattingHelpers } from '../helpers/pr-formatting.helpers.js';

const { formatIsoDatetime } = createPrFormattingHelpers();

export function AuthorCreatedPrsSection() {
  const { payload, selectedAuthorLogin } = usePrData();
  const { getPreferredActorKey } = useActorIdentity();
  const { sortAuthorInsightsCreatedPrsDesc } = useAuthorInsights();
  const rows = Object.values(payload?.byPrNumber || {});
  const createdPrs = sortAuthorInsightsCreatedPrsDesc(
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
        <div className="author-insights-list">
          {createdPrs.map((entry, index) => (
            <div className="author-insights-item" key={entry?.prNumber || entry?.data?.number || index}>
              <AuthorInsightsPrLink entry={entry} />
              <AuthorInsightsPrDataMeta entry={entry}>
                <span className="author-insights-meta-detail">
                  {formatIsoDatetime(entry?.data?.mergedAt || entry?.data?.sourceUpdatedAt || '-')}
                </span>
              </AuthorInsightsPrDataMeta>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
