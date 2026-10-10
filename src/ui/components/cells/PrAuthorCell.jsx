/**
 * PrAuthorCell - Author identity/identities plus a manual-notes indicator.
 * Shows the official PR author (styled distinctly via ActorIdentity's
 * isPrAuthor state, same as before) plus every distinct person with a
 * non-merge commit on the branch. Matches vanilla's author-cell
 * (helpers/pr-author-cell.helpers.js).
 *
 * @module components/cells/PrAuthorCell
 */

import { useMemo } from 'react';
import { ActorIdentity } from '../ActorIdentity';
import { useActorIdentity } from '../../state/ActorIdentityContext';
import { createPrAuthorCellHelpers } from '../../helpers/pr-author-cell.helpers.js';
import { getManualNotesSummary } from '../../helpers/pr-manual-notes-summary.helpers.js';

export function PrAuthorCell({ entry, pr, actorsMap = {} }) {
  const { getPreferredActorKey } = useActorIdentity();
  // createPrAuthorCellHelpers is threaded with the real, alias-resolving
  // getPreferredActorKey (rather than its own viewer-unaware fallback) so
  // a co-author who's also an alias of the PR author is correctly deduped
  // the same way every other actor-identity-aware cluster in this app
  // already resolves aliases - same reasoning as insights/NotesSection.jsx's
  // own noteAuthorMatchesSelection wiring.
  const { collectPrAuthors } = useMemo(
    () => createPrAuthorCellHelpers({ getPreferredActorKey }),
    [getPreferredActorKey],
  );

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
