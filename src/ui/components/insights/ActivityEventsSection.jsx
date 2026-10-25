/**
 * ActivityEventsSection - "Activity sequence" insight section: a
 * deduplicated, chronological feed of comments/reviews/commits/approvals.
 * Matches vanilla's createActivityEventsSection (index.page.js).
 *
 * @module components/insights/ActivityEventsSection
 */

import { InsightSection } from './InsightSection';
import { ActivityEventDescription } from './ActivityEventDescription';
import { usePrInsightsDisplay } from '../../state/PrInsightsDisplayContext';
import { createPrFormattingHelpers } from '../../helpers/pr-formatting.helpers.ts';

const { formatIsoDatetime } = createPrFormattingHelpers();

const BODY_TRUNCATE = 280;

function truncate(text) {
  return text.length > BODY_TRUNCATE ? `${text.slice(0, BODY_TRUNCATE)}…` : text;
}

function getEventKind(event) {
  const eventType = String(event?.type || '');
  const eventChannel = String(event?.channel || '');
  if (eventType === 'approval') return 'approval';
  if (eventType === 'merged') return 'merged';
  if (eventType === 'opened') return 'opened';
  if (eventType === 'closed') return 'closed';
  if (eventChannel === 'commit' || eventType === 'commit') return 'commit';
  if (eventChannel === 'review' || eventType === 'review') return 'review';
  if (eventChannel === 'thread') return 'thread';
  if (eventChannel === 'top-level') return 'top-level';
  return 'system';
}

export function ActivityEventsSection({ pr, actorsMap }) {
  const { normalizePrRootUrl, buildActivityEvents } = usePrInsightsDisplay();

  // The same feed the row summary's "Latest activity" shows the top of
  // (pr-activity-events.helpers.ts).
  const activityEvents = buildActivityEvents(pr);
  if (!activityEvents.length) return null;

  return (
    <InsightSection summaryText="Activity sequence">
      <div className="insight-list">
        {activityEvents.map((event, index) => {
          const bodyText = String(event?.body || '').trim();
          const headline = String(event?.messageHeadline || '').trim();
          const mainText = bodyText || headline;
          const msgBody = String(event?.messageBody || '').trim();

          const directUrl = String(event?.url || '').trim();
          const fallbackUrl = String(pr?.url || '').trim();
          const isReviewEvent = event?.channel === 'review';
          const directIsPrRoot = !!directUrl && normalizePrRootUrl(directUrl) === normalizePrRootUrl(fallbackUrl) && !directUrl.includes('#');
          const linkUrl = directUrl ? (directIsPrRoot && isReviewEvent ? '' : directUrl) : isReviewEvent ? '' : fallbackUrl;

          return (
            <div key={index} className={`insight-list-item insight-event-kind-${getEventKind(event)}`}>
              <div className="insight-event-header">
                <span>
                  {formatIsoDatetime(event?.occurredAt || '-')} |{' '}
                  <ActivityEventDescription event={event} row={pr} actorsMap={actorsMap} />
                </span>
                {linkUrl && (
                  <a className="insight-event-link" href={linkUrl} target="_blank" rel="noopener noreferrer">
                    {directUrl ? 'View →' : 'View PR →'}
                  </a>
                )}
              </div>
              {mainText && <div className="insight-event-body insight-subtle">{truncate(mainText)}</div>}
              {event?.type === 'commit' && msgBody && <div className="insight-event-body insight-subtle">{truncate(msgBody)}</div>}
            </div>
          );
        })}
      </div>
    </InsightSection>
  );
}
