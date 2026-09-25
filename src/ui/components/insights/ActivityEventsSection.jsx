/**
 * ActivityEventsSection - "Activity sequence" insight section: a
 * deduplicated, chronological feed of comments/reviews/commits/approvals.
 * Matches vanilla's createActivityEventsSection (index.page.js).
 *
 * @module components/insights/ActivityEventsSection
 */

import { InsightSection } from './InsightSection';
import { ActivityEventDescription } from './ActivityEventDescription';

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
  if (eventChannel === 'commit' || eventType === 'commit') return 'commit';
  if (eventChannel === 'review' || eventType === 'review') return 'review';
  if (eventChannel === 'thread') return 'thread';
  if (eventChannel === 'top-level') return 'top-level';
  return 'system';
}

function buildActivityEvents(pr) {
  const asArray = window.asArray || ((value) => (Array.isArray(value) ? value : []));
  const buildFallbackActivityEvents = window.buildFallbackActivityEvents || (() => []);
  const buildActivityEventKey = window.buildActivityEventKey || (() => '');

  const timelineEvents = asArray(pr.activityTimeline).flatMap((bucket) => asArray(bucket?.events));
  const sourceEvents = timelineEvents.length ? timelineEvents : asArray(pr.activityEvents);
  const fallbackEvents = buildFallbackActivityEvents(pr);
  const fallbackByKey = new Map(fallbackEvents.map((event) => [buildActivityEventKey(event), event]));
  const fallbackBySourceId = new Map(
    fallbackEvents.filter((event) => String(event?.sourceId || '').trim()).map((event) => [String(event.sourceId), event]),
  );
  const enrichedSourceEvents = sourceEvents.map((event) => {
    const sourceId = String(event?.sourceId || '').trim();
    const fallback = (sourceId ? fallbackBySourceId.get(sourceId) : null) || fallbackByKey.get(buildActivityEventKey(event));
    if (!fallback) return event;
    return {
      ...event,
      body: String(event?.body || '').trim() || String(fallback?.body || ''),
      url: String(event?.url || '').trim() || String(fallback?.url || ''),
      state: String(event?.state || '').trim() || String(fallback?.state || ''),
      messageHeadline: String(event?.messageHeadline || '').trim() || String(fallback?.messageHeadline || ''),
      messageBody: String(event?.messageBody || '').trim() || String(fallback?.messageBody || ''),
      conversationResolved:
        event?.conversationResolved !== undefined ? event.conversationResolved : fallback?.conversationResolved,
    };
  });
  const preDedupeEvents = (enrichedSourceEvents.length ? enrichedSourceEvents : fallbackEvents).slice();

  // A COMMENTED review event whose body was backfilled from its first thread
  // comment produces a visual duplicate alongside the thread comment event.
  // Suppress review(COMMENTED) events that match a thread/top-level comment
  // by actor + minute + body.
  const threadCommentSignatures = new Set(
    preDedupeEvents
      .filter((e) => (String(e?.channel || '') === 'thread' || String(e?.channel || '') === 'top-level') && String(e?.body || '').trim())
      .map((e) => `${String(e?.actor || '')}|${String(e?.occurredAt || '').slice(0, 16)}|${String(e?.body || '').trim()}`),
  );

  const seen = new Set();
  return preDedupeEvents
    .filter((e) => {
      if (String(e?.channel || '') !== 'review' || !String(e?.body || '').trim()) return true;
      const sig = `${String(e?.actor || '')}|${String(e?.occurredAt || '').slice(0, 16)}|${String(e?.body || '').trim()}`;
      return !threadCommentSignatures.has(sig);
    })
    .filter((e) => {
      const ch = String(e?.channel || '');
      if (ch !== 'thread' && ch !== 'top-level') return true;
      const body = String(e?.body || '').trim();
      if (!body) return true;
      const sig = `${ch}|${String(e?.occurredAt || '').slice(0, 16)}|${body}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    })
    .sort((a, b) => String(b?.occurredAt || '').localeCompare(String(a?.occurredAt || '')))
    .slice(0, 60);
}

export function ActivityEventsSection({ pr, actorsMap }) {
  const formatIsoDatetime = window.formatIsoDatetime || ((value) => String(value || '-'));
  const normalizePrRootUrl = window.normalizePrRootUrl || ((url) => String(url || ''));

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
