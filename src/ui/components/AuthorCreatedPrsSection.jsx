/**
 * AuthorCreatedPrsSection - React-owned "PRs created by this author"
 * section for the Author Insights tab.
 *
 * Track B (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md): real JSX
 * now, replacing the ref+useEffect wrapper around
 * pr-author-insights.component.js's buildCreatedPrsSection() (deleted).
 * `selectedAuthorLogin` is now passed as a real prop from
 * renderAuthorInsights (via window.updateAuthorInsightsCreatedPrs) instead
 * of being read from authorInsightsState internally by the wrapped
 * builder - this removes the need for react-app.jsx's previous
 * incrementing-`key` remount hack, since a real prop change is enough to
 * re-derive the filtered/sorted list on every render.
 *
 * Still reads the pure filtering/sorting helpers off window
 * (getPreferredActorKey, sortAuthorInsightsCreatedPrsDesc,
 * formatIsoDatetime) - moving that off window is Track C's concern.
 *
 * Mounted once into the static #author-insights-created-prs-root
 * container and updated via
 * window.updateAuthorInsightsCreatedPrs(rows, selectedAuthorLogin).
 *
 * @module components/AuthorCreatedPrsSection
 */

import React from 'react';
import { AuthorInsightsPrLink } from './AuthorInsightsPrLink';
import { AuthorInsightsPrDataMeta } from './AuthorInsightsPrDataMeta';

const getPreferredActorKey = (login, fallback) =>
  window.getPreferredActorKey ? window.getPreferredActorKey(login, fallback) : String(login || fallback || '').trim();

const sortCreatedPrsDesc = (rows) => (window.sortAuthorInsightsCreatedPrsDesc ? window.sortAuthorInsightsCreatedPrsDesc(rows) : rows);

const formatIsoDatetime = (value) => (window.formatIsoDatetime ? window.formatIsoDatetime(value) : String(value || '-'));

export function AuthorCreatedPrsSection({ rows, selectedAuthorLogin }) {
  const createdPrs = sortCreatedPrsDesc(
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
