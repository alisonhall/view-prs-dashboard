/**
 * ActivityEventDescription - "actor + verb" fragment used in the activity
 * sequence list. Matches vanilla's createActivityEventDescriptionFragment
 * (helpers/pr-activity-event-description.helpers.js).
 *
 * @module components/insights/ActivityEventDescription
 */

import { ActorIdentity } from '../ActorIdentity';

const SUFFIX_BY_TYPE = {
  approval: () => ' approved',
  review: (event) => {
    const state = String(event?.state || '').trim();
    return state ? ` review (${state})` : ' review';
  },
  comment: (event) => (event?.channel === 'thread' ? ' thread comment' : ' comment'),
  commit: () => ' commit',
  opened: () => ' opened PR',
  merged: () => ' merged PR',
};

export function ActivityEventDescription({ event, row, actorsMap }) {
  const type = String(event?.type || 'activity');
  const suffix = (SUFFIX_BY_TYPE[type] || (() => ` ${type}`))(event);

  return (
    <>
      <ActorIdentity
        row={row}
        login={event?.actor}
        actorsMap={actorsMap}
        fallbackName={event?.author?.name || event?.author || event?.actorName}
      />
      {suffix}
    </>
  );
}
