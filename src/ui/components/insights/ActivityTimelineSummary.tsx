/**
 * ActivityTimelineSummary - the "Activity timeline" insight-grid value: a
 * per-day table of actor/action counts, extended day-by-day from the oldest
 * activity to today (open PRs) or to the newest activity (merged PRs), with
 * weekend days omitted when they have no activity. A run of consecutive
 * no-activity weekdays is consolidated into a single "No activity for N
 * days" row rather than one dash row per day; weekends stay excluded from
 * both the row list and that day count, and don't break a run in progress.
 *
 * Originally mirrored vanilla's buildActivityTimelineSummary (index.page.js)
 * - that function returned a plain string only when there was no timeline
 * data at all, otherwise building and returning an actual <table> DOM node,
 * which is why this needed to be a real component rather than a formatted
 * string. That vanilla function was dead code once this component existed
 * (nothing called it at runtime) and has since been deleted (post-Phase-6
 * follow-up, see REACT_MIGRATION_PLAN.md), along with its own
 * pr-activity-timeline-render.helpers.js - this component's own logic is
 * unchanged, it's simply the only implementation left.
 *
 * @module components/insights/ActivityTimelineSummary
 */

import { Fragment, type CSSProperties } from 'react';
import type { PrActivityTimelineBucket, PrData } from '../../types/pr-data.ts';
import type { ActorsMap } from '../../helpers/pr-actor-identity.helpers.ts';
import { ActorIdentity } from '../ActorIdentity';
import { asArray } from '../../helpers/pr-as-array.helpers.ts';

const DATE_CELL_STYLE: CSSProperties = { paddingRight: '12px', paddingTop: '2px', paddingBottom: '2px', verticalAlign: 'top', whiteSpace: 'nowrap' };
const ACTIVITY_CELL_STYLE: CSSProperties = { paddingTop: '2px', paddingBottom: '2px' };

// A timeline bucket as stored (the type lists only what's read here).
type TimelineBucket = PrActivityTimelineBucket & {
  date?: string;
  actor?: string;
  type?: string;
  count?: number | string;
  latestAt?: string;
  author?: { name?: string } | string;
};

interface TimelineItem {
  actor: string;
  fallbackName: string;
  label: string;
  count: number;
}

interface TimelineRow {
  key: string;
  items: TimelineItem[];
  rangeStartKey?: string;
  dayCount?: number;
}

const nameOf = (author: { name?: string } | string | undefined) => (typeof author === 'object' ? author?.name : author);

function typeLabel(type: string, count: number) {
  if (type === 'comment') return count > 1 ? 'comments' : 'comment';
  if (type === 'approval') return 'approved';
  if (type === 'commit') return count > 1 ? 'commits' : 'commit';
  if (type === 'opened') return 'opened PR';
  if (type === 'merged') return 'merged PR';
  if (type === 'closed') return 'closed PR';
  return count > 1 ? `${type}s` : type;
}

function parseDay(value: string | undefined) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const dt = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDay(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeTimelineType(type: unknown) {
  const normalized = String(type || 'activity').trim() || 'activity';
  return normalized === 'review' ? 'comment' : normalized;
}

// Builds { dateKeys, groupedByDate } or null if there's no usable timeline.
function computeTimelineRows(activityTimelineRaw: TimelineBucket[] | undefined, pr: PrData, actorsMap: ActorsMap | undefined) {
  const timeline = Array.isArray(activityTimelineRaw)
    ? activityTimelineRaw
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          date: String(item.date || '').trim(),
          actor: String(item.actor || 'unknown').trim() || 'unknown',
          type: normalizeTimelineType(item.type),
          count: Number.isFinite(Number(item.count)) ? Number(item.count) : 1,
          latestAt: String(item.latestAt || '').trim(),
        }))
        .filter((item) => item.date)
    : [];

  if (!timeline.length) return null;

  const actorNameMap = new Map(
    Object.entries(actorsMap || {}).filter((pair): pair is [string, string] => Boolean(pair[0] && pair[1])),
  );
  const learnFrom = (login: unknown, name: unknown) => {
    const l = String(login || '').trim();
    if (l && !actorNameMap.has(l)) {
      const n = String(name || '').trim();
      if (n && n !== l) actorNameMap.set(l, n);
    }
  };
  // Raw `gh` shapes carry `author: { name }`; the typed fields don't list it.
  type Named = { author?: { name?: string } | string; authorName?: string; actorName?: string };
  asArray(activityTimelineRaw).forEach((bucket) => {
    learnFrom(bucket?.actor, nameOf(bucket?.author));
    asArray(bucket?.events).forEach((event) => learnFrom(event?.actor, nameOf((event as Named)?.author)));
  });
  asArray(pr.comments).forEach((c) => learnFrom(c?.authorLogin, nameOf((c as Named)?.author) || c?.authorName));
  asArray(pr.commentEvents).forEach((e) => learnFrom(e?.actor, (e as Named)?.actorName));
  asArray(pr.reviews).forEach((r) => learnFrom(r?.authorLogin, nameOf(r?.author) || r?.authorName));
  asArray(pr.reviewThreads).forEach((t) =>
    asArray(t?.comments).forEach((c) => learnFrom(c?.authorLogin, nameOf((c as Named)?.author) || c?.authorName)),
  );
  asArray(pr.commits).forEach((commit) => asArray(commit?.authors).forEach((a) => learnFrom(a?.login, a?.name)));

  const getActorDisplay = (login: string) => actorNameMap.get(login) ?? login;

  const sorted = timeline.slice().sort((a, b) => {
    if (a.date !== b.date) return String(b.date).localeCompare(String(a.date));
    if (a.latestAt !== b.latestAt) return String(b.latestAt).localeCompare(String(a.latestAt));
    if (a.actor !== b.actor) return String(a.actor).localeCompare(String(b.actor));
    return String(a.type).localeCompare(String(b.type));
  });

  let currentDate = '';
  let itemsByActorType = new Map<string, { actor: string; type: string; count: number; latestAt: string }>();
  const groupedByDate = new Map<string, TimelineItem[]>();
  const flush = () => {
    if (!currentDate) return;
    groupedByDate.set(
      currentDate,
      Array.from(itemsByActorType.values()).map((entry) => ({
        actor: entry.actor,
        fallbackName: getActorDisplay(entry.actor),
        label: typeLabel(entry.type, entry.count),
        count: entry.count,
      })),
    );
  };
  for (const item of sorted) {
    if (item.date !== currentDate) {
      flush();
      currentDate = item.date;
      itemsByActorType = new Map();
    }
    const key = `${item.actor}::${item.type}`;
    const existing = itemsByActorType.get(key);
    if (existing) {
      existing.count += item.count;
      if (String(item.latestAt).localeCompare(String(existing.latestAt)) > 0) existing.latestAt = item.latestAt;
    } else {
      itemsByActorType.set(key, { actor: item.actor, type: item.type, count: item.count, latestAt: item.latestAt });
    }
  }
  flush();

  const dateKeys = Array.from(groupedByDate.keys()).sort((a, b) => String(b).localeCompare(String(a)));
  if (!dateKeys.length) return null;

  return { dateKeys, groupedByDate };
}

function TimelineItems({ items, pr, actorsMap }: { items: TimelineItem[]; pr: PrData; actorsMap?: ActorsMap }) {
  if (!items.length) return <>-</>;
  return (
    <>
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && '; '}
          <ActorIdentity row={pr} login={item.actor} actorsMap={actorsMap} fallbackName={item.fallbackName} />
          {item.count > 1 ? ` ${item.label} (${item.count})` : ` ${item.label}`}
        </Fragment>
      ))}
    </>
  );
}

export interface ActivityTimelineSummaryProps {
  activityTimelineRaw: TimelineBucket[] | undefined;
  fallbackSummary?: string;
  isOpen: boolean;
  pr: PrData;
  actorsMap?: ActorsMap;
}

export function ActivityTimelineSummary({ activityTimelineRaw, fallbackSummary, isOpen, pr, actorsMap }: ActivityTimelineSummaryProps) {
  const computed = computeTimelineRows(activityTimelineRaw, pr, actorsMap);
  if (!computed) {
    return <>{String(fallbackSummary || '').trim() || '-'}</>;
  }
  const { dateKeys, groupedByDate } = computed;

  const newest = parseDay(dateKeys[0]);
  const oldest = parseDay(dateKeys[dateKeys.length - 1]);

  // If dates don't parse as plain calendar days, just list what we have
  // without extending the range (matches vanilla's fallback branch).
  const rows: TimelineRow[] = [];
  if (!newest || !oldest) {
    for (const date of dateKeys) {
      rows.push({ key: date, items: groupedByDate.get(date) || [] });
    }
  } else {
    const endDate = isOpen ? new Date() : newest;
    const cursor = new Date(endDate.getTime());
    cursor.setUTCHours(23, 59, 59, 999);

    // A run of consecutive no-activity weekdays gets consolidated into one
    // summary row (instead of one dash row per day) so a long quiet
    // stretch doesn't dominate the timeline - weekends stay excluded from
    // both the row list and this day count, exactly as before (they never
    // break a run in progress, and never add to its count).
    let gapNewestKey = '';
    let gapOldestKey = '';
    let gapDayCount = 0;

    const flushGap = () => {
      if (gapDayCount === 0) return;
      if (gapDayCount === 1) {
        rows.push({ key: gapNewestKey, items: [] });
      } else {
        rows.push({
          key: gapNewestKey,
          rangeStartKey: gapOldestKey,
          dayCount: gapDayCount,
          items: [],
        });
      }
      gapNewestKey = '';
      gapOldestKey = '';
      gapDayCount = 0;
    };

    while (cursor.getTime() >= oldest.getTime()) {
      const key = formatDay(cursor);
      const hasActivity = groupedByDate.has(key);
      const dayOfWeek = cursor.getUTCDay();
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

      if (hasActivity) {
        flushGap();
        rows.push({ key, items: groupedByDate.get(key) || [] });
      } else if (isWeekday) {
        if (gapDayCount === 0) gapNewestKey = key;
        gapOldestKey = key;
        gapDayCount += 1;
      }
      // A no-activity weekend is skipped entirely, same as before.

      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    flushGap();
  }

  if (!rows.length) return <>-</>;

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td style={DATE_CELL_STYLE}>
              {row.dayCount ? `${row.rangeStartKey} – ${row.key}` : row.key}
            </td>
            <td style={ACTIVITY_CELL_STYLE}>
              {row.dayCount ? (
                `No activity for ${row.dayCount} days`
              ) : (
                <TimelineItems items={row.items} pr={pr} actorsMap={actorsMap} />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
