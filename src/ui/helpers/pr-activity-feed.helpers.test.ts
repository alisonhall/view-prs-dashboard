import type { PrActivityEvent } from '../types/pr-data.ts';
import {
  ACTIVITY_KINDS,
  activityKindOf,
  buildActivityFeed,
  dayKeyOf,
  describeDay,
  formatTimeOfDay,
  getLastLookedAt,
  type ActivityFeedOptions,
} from './pr-activity-feed.helpers.ts';

const event = (id: string, occurredAt: string, extra: Partial<PrActivityEvent> = {}): PrActivityEvent => ({
  sourceId: id,
  occurredAt,
  actor: 'alice',
  type: 'comment',
  channel: 'top-level',
  ...extra,
});
const commit = (id: string, occurredAt: string, actor = 'alice') => event(id, occurredAt, { type: 'commit', channel: 'commit', actor });

const ALL: ActivityFeedOptions = { scope: 'all', lastLookedAt: '', kinds: ACTIVITY_KINDS, timeZone: 'UTC' };

// The feed's items as short labels, per day.
const outline = (feed: ReturnType<typeof buildActivityFeed>) =>
  feed.days.map((day) => ({
    day: day.key,
    items: day.items.map((item) =>
      item.kind === 'event' ? item.event.sourceId : item.kind === 'commits' ? `commits:${item.events.map((e) => e.sourceId).join(',')}` : 'marker',
    ),
  }));

describe('activityKindOf', () => {
  test.each([
    [{ type: 'commit', channel: 'commit' }, 'commit'],
    [{ type: 'approval', channel: 'review' }, 'review'],
    [{ type: 'review', channel: 'review', state: 'CHANGES_REQUESTED' }, 'review'],
    [{ type: 'comment', channel: 'thread' }, 'comment'],
    [{ type: 'comment', channel: 'top-level' }, 'comment'],
    [{ type: 'merged', channel: 'system' }, 'event'],
    [{ type: 'opened' }, 'event'],
  ])('given %o, then it is a %s', (extra, kind) => {
    expect(activityKindOf(extra)).toBe(kind);
  });
});

describe('getLastLookedAt', () => {
  test('is the later of the last activity and the last Ack', () => {
    expect(getLastLookedAt('2026-01-02T00:00:00Z', '2026-01-05T00:00:00Z')).toBe('2026-01-05T00:00:00Z');
    expect(getLastLookedAt('2026-01-09T00:00:00Z', '2026-01-05T00:00:00Z')).toBe('2026-01-09T00:00:00Z');
  });

  test('uses whichever is known, and is empty with neither', () => {
    expect(getLastLookedAt('-', '2026-01-05T00:00:00Z')).toBe('2026-01-05T00:00:00Z');
    expect(getLastLookedAt('2026-01-02T00:00:00Z', undefined)).toBe('2026-01-02T00:00:00Z');
    expect(getLastLookedAt('', '')).toBe('');
  });
});

describe('buildActivityFeed', () => {
  const events = [
    event('c3', '2026-01-03T15:00:00Z'),
    event('r2', '2026-01-03T09:00:00Z', { type: 'approval', channel: 'review' }),
    event('c1', '2026-01-01T12:00:00Z'),
  ];

  test('groups events by day, newest first', () => {
    expect(outline(buildActivityFeed(events, ALL))).toEqual([
      { day: '2026-01-03', items: ['c3', 'r2'] },
      { day: '2026-01-01', items: ['c1'] },
    ]);
  });

  test('groups by calendar day in the given time zone', () => {
    const feed = buildActivityFeed([event('late', '2026-01-03T02:00:00Z')], { ...ALL, timeZone: 'America/New_York' });
    expect(feed.days[0]?.key).toBe('2026-01-02');
  });

  test('"Since I last looked" shows only newer events, and counts the earlier ones it leaves out', () => {
    const feed = buildActivityFeed(events, { ...ALL, scope: 'since', lastLookedAt: '2026-01-02T00:00:00Z' });
    expect(outline(feed)).toEqual([{ day: '2026-01-03', items: ['c3', 'r2'] }]);
    expect(feed).toMatchObject({ totalCount: 3, sinceCount: 2, earlierCount: 1, shownCount: 2 });
  });

  test('"All" with a last-looked time marks where the older events begin', () => {
    const feed = buildActivityFeed(events, { ...ALL, lastLookedAt: '2026-01-03T10:00:00Z' });
    expect(outline(feed)).toEqual([
      { day: '2026-01-03', items: ['c3', 'marker', 'r2'] },
      { day: '2026-01-01', items: ['c1'] },
    ]);
    expect(feed.earlierCount).toBe(0);
  });

  test('the earlier events "Since" leaves out are counted within the chosen types', () => {
    const feed = buildActivityFeed(
      [event('new', '2026-01-05T00:00:00Z'), event('oldComment', '2026-01-01T00:00:00Z'), commit('oldCommit', '2026-01-01T01:00:00Z')],
      { ...ALL, scope: 'since', lastLookedAt: '2026-01-02T00:00:00Z', kinds: ['commit'] },
    );
    expect(feed.earlierCount).toBe(1);
  });

  test('day keys, times of day and day headings each reuse their formatter', () => {
    const spy = jest.spyOn(Intl, 'DateTimeFormat');
    const now = Date.parse('2026-10-24T12:00:00Z');
    try {
      for (const day of ['01', '02', '03']) {
        dayKeyOf(`2026-01-${day}T00:00:00Z`, 'Asia/Tokyo');
        formatTimeOfDay(`2026-01-${day}T00:00:00Z`, 'Asia/Tokyo');
        describeDay(`2026-02-${day}`, now, 'Asia/Tokyo');
      }
      // The day key formatter (also used by describeDay for today/yesterday)
      // and the time-of-day one, once each for this zone.
      expect(spy.mock.calls.filter(([, options]) => options?.timeZone === 'Asia/Tokyo')).toHaveLength(2);
      // describeDay's weekday and month-day formatters (UTC), at most once each.
      expect(spy.mock.calls.filter(([, options]) => options?.timeZone === 'UTC').length).toBeLessThanOrEqual(2);
    } finally {
      spy.mockRestore();
    }
  });

  test('formatTimeOfDay gives the time of day in the zone, and nothing for no time', () => {
    expect(formatTimeOfDay('2026-01-01T15:05:00Z', 'UTC')).toBe('3:05 PM');
    expect(formatTimeOfDay('', 'UTC')).toBe('');
  });

  test('without a last-looked time, "Since" shows everything and there is no marker', () => {
    const feed = buildActivityFeed(events, { ...ALL, scope: 'since' });
    expect(feed.shownCount).toBe(3);
    expect(feed.sinceCount).toBe(0);
    expect(outline(feed).flatMap((day) => day.items)).not.toContain('marker');
  });

  test('the type filter keeps only chosen kinds; the counts are per kind within the scope', () => {
    const feed = buildActivityFeed(events, { ...ALL, kinds: ['review'] });
    expect(outline(feed)).toEqual([{ day: '2026-01-03', items: ['r2'] }]);
    expect(feed.kindCounts).toEqual({ commit: 0, review: 1, comment: 2, event: 0 });
    expect(feed.shownCount).toBe(1);
  });

  test('collapses one person\'s run of commits on a day into one item', () => {
    const feed = buildActivityFeed(
      [
        commit('k4', '2026-01-03T15:00:00Z'),
        commit('k3', '2026-01-03T14:00:00Z'),
        commit('k2', '2026-01-03T13:00:00Z'),
        commit('b1', '2026-01-03T12:00:00Z', 'bob'),
        commit('k1', '2026-01-02T12:00:00Z'),
      ],
      ALL,
    );
    expect(outline(feed)).toEqual([
      { day: '2026-01-03', items: ['commits:k4,k3,k2', 'b1'] },
      { day: '2026-01-02', items: ['k1'] },
    ]);
  });

  test('a run is broken by another event in between, and by the last-looked marker', () => {
    const feed = buildActivityFeed(
      [commit('k3', '2026-01-03T15:00:00Z'), event('c', '2026-01-03T14:00:00Z'), commit('k2', '2026-01-03T13:00:00Z'), commit('k1', '2026-01-03T12:00:00Z')],
      { ...ALL, lastLookedAt: '2026-01-03T12:30:00Z' },
    );
    expect(outline(feed)).toEqual([{ day: '2026-01-03', items: ['k3', 'c', 'k2', 'marker', 'k1'] }]);
  });

  test('events without a valid time go in a day of their own', () => {
    expect(dayKeyOf('not a time')).toBe('');
    expect(outline(buildActivityFeed([event('x', '')], ALL))).toEqual([{ day: '', items: ['x'] }]);
  });
});

describe('describeDay', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');

  test('names today and yesterday', () => {
    expect(describeDay('2026-10-24', now, 'UTC')).toBe('Today');
    expect(describeDay('2026-10-23', now, 'UTC')).toBe('Yesterday');
  });

  test('gives other days their weekday and date, with the year when it differs', () => {
    expect(describeDay('2026-10-21', now, 'UTC')).toBe('Wed · Oct 21');
    expect(describeDay('2025-12-30', now, 'UTC')).toBe('Tue · Dec 30, 2025');
    expect(describeDay('', now, 'UTC')).toBe('Unknown date');
  });
});
