/**
 * AuthorInsightsNotesSection - React-owned "PR-linked custom comments and
 * sentiment" section for the Author Insights tab.
 *
 * Track B (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md): real JSX
 * now, replacing the ref+useEffect wrapper around
 * pr-author-insights.component.js's buildPrLinkedNotesSection() (deleted).
 *
 * Still reads the pure filtering/sorting/formatting helpers off window
 * (noteAuthorMatchesSelection, sortAuthorInsightsNoteMatchesDesc,
 * resolveActorDisplayName, getAuthorInsightsNoteDisplayTimestamp,
 * getAuthorInsightsSentimentLabel/BadgeClassName) - moving that off window
 * is Track C's concern, not this one.
 *
 * `selectedAuthor` is a freshly-computed object on every render call from
 * renderAuthorInsights, so a plain prop-driven render already reflects
 * every author switch without needing a key remount.
 *
 * @module components/AuthorInsightsNotesSection
 */

import React from 'react';
import { AuthorInsightsPrLink } from './AuthorInsightsPrLink';
import { AuthorInsightsPrDataMeta } from './AuthorInsightsPrDataMeta';

const asArray = (value) => (window.asArray ? window.asArray(value) : Array.isArray(value) ? value : []);

const noteAuthorMatchesSelection = (author, selectedAuthor, actorsMap) =>
  window.noteAuthorMatchesSelection ? window.noteAuthorMatchesSelection(author, selectedAuthor, actorsMap) : false;

const sortNoteMatchesDesc = (matches) => (window.sortAuthorInsightsNoteMatchesDesc ? window.sortAuthorInsightsNoteMatchesDesc(matches) : matches);

const resolveActorDisplayName = (login, actorsMap, fallback) =>
  window.resolveActorDisplayName ? window.resolveActorDisplayName(login, actorsMap, fallback) : String(fallback || login || '').trim();

const getNoteDisplayTimestamp = (comment, entry) =>
  window.getAuthorInsightsNoteDisplayTimestamp ? window.getAuthorInsightsNoteDisplayTimestamp(comment, entry) : '-';

const getSentimentLabel = (value) => (window.getAuthorInsightsSentimentLabel ? window.getAuthorInsightsSentimentLabel(value) : 'Neutral');

const getSentimentBadgeClassName = (value) =>
  window.getAuthorInsightsSentimentBadgeClassName ? window.getAuthorInsightsSentimentBadgeClassName(value) : '';

export function AuthorInsightsNotesSection({ rows, selectedAuthor, actorsMap }) {
  const noteMatches = (Array.isArray(rows) ? rows : []).flatMap((entry) =>
    asArray(entry?.notes?.comments)
      .filter((comment) => noteAuthorMatchesSelection(comment?.author, selectedAuthor, actorsMap))
      .map((comment) => ({ entry, comment })),
  );
  const sortedNoteMatches = sortNoteMatchesDesc(noteMatches);

  return (
    <section className="author-insights-section">
      <h3>PR-linked custom comments and sentiment</h3>
      {sortedNoteMatches.length === 0 ? (
        <p className="stats-empty">No saved custom comments or sentiment for this author.</p>
      ) : (
        <div className="author-insights-list">
          {sortedNoteMatches.map(({ entry, comment }, index) => {
            const noteAuthorLabel = resolveActorDisplayName(comment?.author, actorsMap, comment?.author);
            return (
              <div className="author-insights-item" key={comment?.id || `${entry?.prNumber || index}-${index}`}>
                <AuthorInsightsPrLink entry={entry} />
                <AuthorInsightsPrDataMeta entry={entry} />
                <div className="author-insights-meta">
                  <span className="author-insights-meta-detail">{`Author: ${noteAuthorLabel}`}</span>
                  <span className="author-insights-meta-detail">{`Added: ${getNoteDisplayTimestamp(comment, entry)}`}</span>
                  <span className={`author-insights-badge ${getSentimentBadgeClassName(comment?.tone)}`.trim()}>
                    {`Sentiment: ${getSentimentLabel(comment?.tone)}`}
                  </span>
                </div>
                <div className="author-insights-body">{String(comment?.note || '').trim() || '(No custom comment text)'}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
