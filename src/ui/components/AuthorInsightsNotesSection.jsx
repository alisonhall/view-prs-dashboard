/**
 * AuthorInsightsNotesSection - React-owned "PR-linked custom comments and
 * sentiment" section for the Author Insights tab.
 *
 * Track C (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md): reads
 * `payload`/`selectedAuthorLogin` straight from PrDataContext instead of
 * being pushed props via window.updateAuthorInsightsNotes (deleted), and
 * reconstructs the `{login, name}` selectedAuthor shape itself via
 * window.resolveActorDisplayName (already exposed, used below) rather than
 * needing buildAuthorInsightsEntries exposed too.
 *
 * Still reads the pure filtering/sorting/formatting helpers off window
 * (noteAuthorMatchesSelection, sortAuthorInsightsNoteMatchesDesc,
 * resolveActorDisplayName, getAuthorInsightsNoteDisplayTimestamp,
 * getAuthorInsightsSentimentLabel/BadgeClassName) - moving those off
 * window is a separate concern.
 *
 * @module components/AuthorInsightsNotesSection
 */

import { AuthorInsightsPrLink } from './AuthorInsightsPrLink';
import { AuthorInsightsPrDataMeta } from './AuthorInsightsPrDataMeta';
import { usePrData } from '../state/PrDataContext';

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

export function AuthorInsightsNotesSection() {
  const { payload, selectedAuthorLogin } = usePrData();
  const rows = Object.values(payload?.byPrNumber || {});
  const actorsMap = payload?.actorsMap || {};
  const selectedAuthor = selectedAuthorLogin
    ? { login: selectedAuthorLogin, name: resolveActorDisplayName(selectedAuthorLogin, actorsMap, selectedAuthorLogin) }
    : null;

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
