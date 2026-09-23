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
 * Still reads the pure filtering/sorting helpers off window
 * (getPreferredActorKey, sortAuthorInsightsCreatedPrsDesc,
 * formatIsoDatetime) - moving those off window is a separate concern.
 *
 * Mounted once into the static #author-insights-created-prs-root
 * container.
 *
 * @module components/AuthorCreatedPrsSection
 */

import React from 'react';
import { AuthorInsightsPrLink } from './AuthorInsightsPrLink';
import { AuthorInsightsPrDataMeta } from './AuthorInsightsPrDataMeta';
import { usePrData } from '../state/PrDataContext';

const getPreferredActorKey = (login, fallback) =>
  window.getPreferredActorKey ? window.getPreferredActorKey(login, fallback) : String(login || fallback || '').trim();

const sortCreatedPrsDesc = (rows) => (window.sortAuthorInsightsCreatedPrsDesc ? window.sortAuthorInsightsCreatedPrsDesc(rows) : rows);

const formatIsoDatetime = (value) => (window.formatIsoDatetime ? window.formatIsoDatetime(value) : String(value || '-'));

export function AuthorCreatedPrsSection() {
  const { payload, selectedAuthorLogin } = usePrData();
  const rows = Object.values(payload?.byPrNumber || {});
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
