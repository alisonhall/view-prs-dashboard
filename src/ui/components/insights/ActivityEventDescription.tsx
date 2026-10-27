/**
 * ActivityEventDescription - who did what, for one activity event: the
 * actor (styled when it's the viewer or the PR author) and a short verb
 * phrase ("approved", "requested changes", "commented in a thread",
 * "pushed a commit"). The PR's own events without a known actor read
 * "PR merged" etc. Used by the detail pane's Activity tab and the row
 * summary.
 *
 * @module components/insights/ActivityEventDescription
 */

import type { PrActivityEvent, PrData } from '../../types/pr-data.ts';
import type { ActorsMap } from '../../helpers/pr-actor-identity.helpers.ts';
import { ActorIdentity } from '../ActorIdentity';

const REVIEW_STATE_TEXT: Record<string, string> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'requested changes',
  COMMENTED: 'reviewed',
  DISMISSED: 'had a review dismissed',
};

// The verb phrase for an event, e.g. "requested changes".
export const describeActivityAction = (event: PrActivityEvent): string => {
  const type = String(event?.type || 'activity');
  if (type === 'approval') return 'approved';
  if (type === 'review') return REVIEW_STATE_TEXT[String(event?.state || '').trim().toUpperCase()] || 'reviewed';
  if (type === 'comment') return event?.channel === 'thread' ? 'commented in a thread' : 'commented';
  if (type === 'commit') return 'pushed a commit';
  if (type === 'opened') return 'opened the PR';
  if (type === 'merged') return 'merged the PR';
  if (type === 'closed') return 'closed the PR';
  return type;
};

// The PR's own events, when nobody's recorded as doing them.
const ACTORLESS_TEXT: Record<string, string> = { opened: 'PR opened', merged: 'PR merged', closed: 'PR closed' };

export interface ActivityEventDescriptionProps {
  event: PrActivityEvent & { author?: { name?: string } | string; actorName?: string };
  row: PrData;
  actorsMap?: ActorsMap;
}

export function ActivityEventDescription({ event, row, actorsMap = {} }: ActivityEventDescriptionProps) {
  const actor = String(event?.actor || '').trim();
  const type = String(event?.type || '');
  if ((!actor || actor === 'unknown') && ACTORLESS_TEXT[type]) {
    return <>{ACTORLESS_TEXT[type]}</>;
  }
  const author = event?.author;
  const fallbackName = (typeof author === 'object' ? author?.name : author) || event?.actorName;
  return (
    <>
      <ActorIdentity row={row} login={event?.actor} actorsMap={actorsMap} fallbackName={fallbackName} /> {describeActivityAction(event)}
    </>
  );
}
