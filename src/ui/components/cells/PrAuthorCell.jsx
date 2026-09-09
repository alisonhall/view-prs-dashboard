/**
 * PrAuthorCell - Author identity plus a manual-notes indicator.
 * Matches vanilla's author-cell (helpers/pr-author-cell.helpers.js).
 *
 * @module components/cells/PrAuthorCell
 */

import React from 'react';
import { ActorIdentity } from '../ActorIdentity';

export function PrAuthorCell({ entry, pr, actorsMap = {} }) {
  const getPreferredActorKey = window.getPreferredActorKey || ((login, name) => String(login || name || '').trim());
  const getManualNotesSummary =
    window.getManualNotesSummary || (() => ({ hasNotes: false, commentsCount: 0, hasOtherNotes: false }));

  const authorLogin = getPreferredActorKey(pr?.authorLogin, pr?.author);
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
      {authorLogin ? (
        <ActorIdentity
          as="div"
          row={pr}
          login={authorLogin}
          actorsMap={actorsMap}
          fallbackName={pr?.author}
          className="author-cell-name"
        />
      ) : (
        <div className="author-cell-name">-</div>
      )}
      <div className={notesClassName} title={notesTitle}>
        {notesSummary.hasNotes ? '📝 Notes' : ''}
      </div>
    </td>
  );
}
