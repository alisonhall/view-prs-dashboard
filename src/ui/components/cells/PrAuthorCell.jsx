/**
 * PrAuthorCell - Author identity/identities plus a manual-notes indicator.
 * Shows the official PR author (styled distinctly via ActorIdentity's
 * isPrAuthor state, same as before) plus every distinct person with a
 * non-merge commit on the branch. Matches vanilla's author-cell
 * (helpers/pr-author-cell.helpers.js).
 *
 * @module components/cells/PrAuthorCell
 */

import React from 'react';
import { ActorIdentity } from '../ActorIdentity';

export function PrAuthorCell({ entry, pr, actorsMap = {} }) {
  const collectPrAuthors = window.collectPrAuthors || ((row) => {
    const key = String(row?.authorLogin || row?.author || '').trim();
    return key ? [{ key, name: row?.author || '', isPrimary: true }] : [];
  });
  const getManualNotesSummary =
    window.getManualNotesSummary || (() => ({ hasNotes: false, commentsCount: 0, hasOtherNotes: false }));

  const authors = collectPrAuthors(pr);
  const notesSummary = getManualNotesSummary(entry, pr);
  const notesClassName = [
    'author-notes-indicator',
    notesSummary.hasNotes ? 'author-notes-indicator-has' : 'author-notes-indicator-none',
  ]
    .filter(Boolean)
    .join(' ');
  const notesTitle = notesSummary.hasNotes
    ? `${notesSummary.commentsCount} manual comment${notesSummary.commentsCount === 1 ? '' : 's'}${notesSummary.hasOtherNotes ? ' + other notes' : ''}`
    : 'No manual comments or notes';

  return (
    <td className="author-cell">
      {authors.length > 0 ? (
        <div className="author-cell-names">
          {authors.map(({ key, name, isPrimary }) => (
            <ActorIdentity
              key={key}
              as="span"
              row={pr}
              login={key}
              actorsMap={actorsMap}
              fallbackName={name}
              className={isPrimary ? 'author-cell-name' : 'author-cell-name author-cell-co-author'}
            />
          ))}
        </div>
      ) : (
        <div className="author-cell-name">-</div>
      )}
      <div className={notesClassName} title={notesTitle}>
        {notesSummary.hasNotes ? '📝 Notes' : ''}
      </div>
    </td>
  );
}
