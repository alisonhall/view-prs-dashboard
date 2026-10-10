/**
 * AuthorInsightsNotesSection - React-owned "PR-linked custom comments and
 * sentiment" section for the Author Insights tab.
 *
 * Track C (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md): reads
 * `payload`/`selectedAuthorLogin` straight from PrDataContext instead of
 * being pushed props via window.updateAuthorInsightsNotes (deleted), and
 * reconstructs the `{login, name}` selectedAuthor shape itself via
 * useActorIdentity()'s resolveActorDisplayName rather than needing
 * buildAuthorInsightsEntries exposed too.
 *
 * noteAuthorMatchesSelection, sortAuthorInsightsNoteMatchesDesc,
 * getAuthorInsightsNoteDisplayTimestamp, and
 * getAuthorInsightsSentimentLabel/BadgeClassName all come from
 * useAuthorInsights() (Phase 7, sub-phase 7.0 - see
 * REACT_MIGRATION_PLAN.md).
 *
 * @module components/AuthorInsightsNotesSection
 */

import { AuthorInsightsPrLink } from './AuthorInsightsPrLink';
import { AuthorInsightsPrDataMeta } from './AuthorInsightsPrDataMeta';
import { usePrData } from '../state/PrDataContext';
import { useActorIdentity } from '../state/ActorIdentityContext';
import { useAuthorInsights } from '../state/AuthorInsightsContext';
import { asArray } from '../helpers/pr-as-array.helpers.js';

export function AuthorInsightsNotesSection() {
  const { payload, selectedAuthorLogin } = usePrData();
  const { resolveActorDisplayName } = useActorIdentity();
  const {
    noteAuthorMatchesSelection,
    sortAuthorInsightsNoteMatchesDesc,
    getAuthorInsightsNoteDisplayTimestamp,
    getAuthorInsightsSentimentLabel,
    getAuthorInsightsSentimentBadgeClassName,
  } = useAuthorInsights();
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
  const sortedNoteMatches = sortAuthorInsightsNoteMatchesDesc(noteMatches);

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
                  <span className="author-insights-meta-detail">{`Added: ${getAuthorInsightsNoteDisplayTimestamp(comment, entry)}`}</span>
                  <span className={`author-insights-badge ${getAuthorInsightsSentimentBadgeClassName(comment?.tone)}`.trim()}>
                    {`Sentiment: ${getAuthorInsightsSentimentLabel(comment?.tone)}`}
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
