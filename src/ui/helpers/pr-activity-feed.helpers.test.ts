import type { PrActivityEvent } from '../types/pr-data.ts';
import {
  ACTIVITY_KINDS,
  activityKindOf,
  buildAckEvents,
  buildActivityFeed,
  dayKeyOf,
  describeDay,
  describeLastLooked,
  describeSinceLastLooked,
  findChangesRequestedBy,
  formatTimeOfDay,
  formatWhenShort,
  getLastAckedAt,
  getLastLookedAt,
  newCommitOidsFor,
  summarizeSinceLastLooked,
  withAckEvents,
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

describe('commits pushed after the review last looked at', () => {
  // Reviewed at 11:00; c2 was committed at 10:00 and pushed after.
  const events = [commit('c2', '2026-03-01T10:00:00Z'), commit('c1', '2026-03-01T09:00:00Z')];
  const since: ActivityFeedOptions = { ...ALL, scope: 'since', lastLookedAt: '2026-03-01T11:00:00Z' };

  test('count as since then, though dated before', () => {
    const feed = buildActivityFeed(events, { ...since, newCommitOids: ['c2'] });
    expect(feed.sinceCount).toBe(1);
    expect(outline(feed)).toEqual([{ day: '2026-03-01', items: ['c2'] }]);
  });

  test('without the list, go by date', () => {
    expect(buildActivityFeed(events, since).sinceCount).toBe(0);
  });

  test('only commits: another event with that id stays by its date', () => {
    const feed = buildActivityFeed([event('c2', '2026-03-01T10:00:00Z')], { ...since, newCommitOids: ['c2'] });
    expect(feed.sinceCount).toBe(0);
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
      // The day key formatter (also used by describeDay for today)
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

  // New York: 8 March 2026 is 23 hours long, 1 November 2026 is 25.
  test('yesterday is the calendar day before, across a daylight saving change and a new year', () => {
    const afterSpringForward = Date.parse('2026-03-09T04:30:00Z'); // 00:30 on 9 March
    expect(describeDay('2026-03-08', afterSpringForward, 'America/New_York')).toBe('Yesterday');
    expect(describeDay('2026-03-07', afterSpringForward, 'America/New_York')).toBe('Sat · Mar 7');

    const endOfFallBack = Date.parse('2026-11-02T04:30:00Z'); // 23:30 on 1 November
    expect(describeDay('2026-11-01', endOfFallBack, 'America/New_York')).toBe('Today');
    expect(describeDay('2026-10-31', endOfFallBack, 'America/New_York')).toBe('Yesterday');

    expect(describeDay('2025-12-31', Date.parse('2026-01-01T09:00:00Z'), 'UTC')).toBe('Yesterday');
  });

  test('gives other days their weekday and date, with the year when it differs', () => {
    expect(describeDay('2026-10-21', now, 'UTC')).toBe('Wed · Oct 21');
    expect(describeDay('2025-12-30', now, 'UTC')).toBe('Tue · Dec 30, 2025');
    expect(describeDay('', now, 'UTC')).toBe('Unknown date');
  });
});

describe('your Acks among the events', () => {
  test('every Ack in the history and the current one, newest first, the current one marked', () => {
    const acks = buildAckEvents(['2026-01-02T00:00:00Z', '2026-01-05T00:00:00Z'], '2026-01-05T00:00:00Z', 'me');
    expect(acks.map((ack) => [ack.occurredAt, ack.state, ack.type, ack.actor])).toEqual([
      ['2026-01-05T00:00:00Z', 'current', 'ack', 'me'],
      ['2026-01-02T00:00:00Z', '', 'ack', 'me'],
    ]);
    expect(activityKindOf(acks[0])).toBe('event');
  });

  test('an Ack from before the history, and one cleared by a change since', () => {
    expect(buildAckEvents(undefined, '2026-01-01T00:00:00Z', 'me').map((ack) => ack.state)).toEqual(['current']);
    // Cleared by new activity: still there, not current.
    expect(buildAckEvents(['2026-01-03T00:00:00Z'], '', 'me').map((ack) => [ack.occurredAt, ack.state])).toEqual([['2026-01-03T00:00:00Z', '']]);
    expect(buildAckEvents([], '', 'me')).toEqual([]);
  });

  test('merged into the feed in time order', () => {
    const merged = withAckEvents([commit('c2', '2026-01-04T00:00:00Z'), commit('c1', '2026-01-01T00:00:00Z')], buildAckEvents(['2026-01-02T00:00:00Z'], '', 'me'));
    expect(merged.map((item) => item.sourceId)).toEqual(['c2', 'ack-2026-01-02T00:00:00Z', 'c1']);
  });
});

describe('getLastAckedAt', () => {
  test('the latest of the history and the current Ack; empty when never', () => {
    expect(getLastAckedAt(['2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z'], '2026-01-02T00:00:00Z')).toBe('2026-01-03T00:00:00Z');
    expect(getLastAckedAt(undefined, '2026-01-02T00:00:00Z')).toBe('2026-01-02T00:00:00Z');
    expect(getLastAckedAt([], 'true')).toBe('');
  });
});

describe('newCommitOidsFor', () => {
  test("the commits after your review, while your last activity is when you last looked - not after a later Ack", () => {
    const pr = { baseline: '2026-01-02T00:00:00Z', commitsAfterReview: ['c1'] };
    expect(newCommitOidsFor(pr, '2026-01-02T00:00:00Z')).toEqual(['c1']);
    expect(newCommitOidsFor(pr, '2026-01-03T00:00:00Z')).toEqual([]);
    expect(newCommitOidsFor(pr, '')).toEqual([]);
  });
});

describe('summarizeSinceLastLooked', () => {
  const events = [
    event('m', '2026-01-05T00:00:00Z', { type: 'merged', channel: 'system', actor: 'unknown' }),
    event('ap', '2026-01-04T00:00:00Z', { type: 'approval', channel: 'review', actor: 'ann', state: 'APPROVED' }),
    event('cr', '2026-01-04T00:00:00Z', { type: 'review', channel: 'review', actor: 'sam', state: 'CHANGES_REQUESTED' }),
    event('cr2', '2026-01-03T12:00:00Z', { type: 'review', channel: 'review', actor: 'sam', state: 'CHANGES_REQUESTED' }),
    // One commit, two authors: two events, one commit.
    commit('c2', '2026-01-03T00:00:00Z', 'alice'),
    commit('c2', '2026-01-03T00:00:00Z', 'bob'),
    event('t', '2026-01-03T00:00:00Z', { channel: 'thread' }),
    event('ack-x', '2026-01-02T12:00:00Z', { type: 'ack', channel: 'system' }),
    // Dated before you looked, but after your review.
    commit('c1', '2026-01-01T00:00:00Z'),
    event('old', '2026-01-01T00:00:00Z'),
  ];

  test('the new events, newest first, and how many of each kind - each commit once, no Acks', () => {
    const since = summarizeSinceLastLooked(events, { lastLookedAt: '2026-01-02T00:00:00Z', newCommitOids: ['c1'] });
    expect(since.events.map((item) => item.sourceId)).toEqual(['m', 'ap', 'cr', 'cr2', 'c2', 'c2', 't', 'c1']);
    expect(since).toMatchObject({ commits: 2, reviews: 3, comments: 1, approvedBy: ['ann'], changesRequestedBy: ['sam'], merged: true, closed: false });
  });

  test('nothing without a last-looked time', () => {
    expect(summarizeSinceLastLooked(events, { lastLookedAt: '' }).events).toEqual([]);
  });

  test("the empty review GitHub wraps an inline comment in isn't a review; a commented review with text is", () => {
    const since = summarizeSinceLastLooked(
      [
        event('wrap', '2026-01-03T00:00:00Z', { type: 'review', channel: 'review', actor: 'sam', state: 'COMMENTED', body: '' }),
        event('reply', '2026-01-03T00:00:00Z', { channel: 'thread', actor: 'sam' }),
        event('said', '2026-01-04T00:00:00Z', { type: 'review', channel: 'review', actor: 'ann', state: 'COMMENTED', body: 'Thoughts' }),
      ],
      { lastLookedAt: '2026-01-02T00:00:00Z' },
    );
    expect(since).toMatchObject({ reviews: 1, comments: 1 });
    // Still among the events, as in the Activity tab.
    expect(since.events).toHaveLength(3);
  });

  test("a reviewer is named by their newest verdict only", () => {
    const since = summarizeSinceLastLooked(
      [
        event('ap', '2026-01-04T00:00:00Z', { type: 'approval', channel: 'review', actor: 'sam', state: 'APPROVED' }),
        event('cr', '2026-01-03T00:00:00Z', { type: 'review', channel: 'review', actor: 'sam', state: 'CHANGES_REQUESTED' }),
      ],
      { lastLookedAt: '2026-01-02T00:00:00Z' },
    );
    expect(since).toMatchObject({ reviews: 2, approvedBy: ['sam'], changesRequestedBy: [] });
    expect(describeSinceLastLooked(since)).toEqual(['2 reviews (approved by sam)']);
  });

  test('in words, with names', () => {
    const since = summarizeSinceLastLooked(events, { lastLookedAt: '2026-01-02T00:00:00Z', newCommitOids: ['c1'] });
    expect(describeSinceLastLooked(since, (login) => login.toUpperCase())).toEqual([
      '2 commits',
      '3 reviews (approved by ANN; changes requested by SAM)',
      '1 comment',
      'Merged',
    ]);
    expect(describeSinceLastLooked(summarizeSinceLastLooked(events, { lastLookedAt: '2026-01-06T00:00:00Z' }))).toEqual([]);
  });
});

describe('findChangesRequestedBy', () => {
  test("reviewers whose latest verdict requested changes; a comment-only review doesn't change it, approving or dismissal does", () => {
    expect(
      findChangesRequestedBy([
        { authorLogin: 'sam', state: 'CHANGES_REQUESTED', submittedAt: '2026-01-01T00:00:00Z' },
        { authorLogin: 'sam', state: 'COMMENTED', submittedAt: '2026-01-02T00:00:00Z' },
        { authorLogin: 'ann', state: 'CHANGES_REQUESTED', submittedAt: '2026-01-01T00:00:00Z' },
        { authorLogin: 'ann', state: 'APPROVED', submittedAt: '2026-01-03T00:00:00Z' },
        { authorLogin: 'dee', state: 'CHANGES_REQUESTED', submittedAt: '2026-01-01T00:00:00Z' },
        { authorLogin: 'dee', state: 'DISMISSED', submittedAt: '2026-01-02T00:00:00Z' },
        { authorLogin: 'kim', state: 'CHANGES_REQUESTED', submittedAt: '2026-01-04T00:00:00Z' },
      ]),
    ).toEqual(['kim', 'sam']);
    expect(findChangesRequestedBy(undefined)).toEqual([]);
  });
});

describe('formatWhenShort and describeLastLooked', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');

  test('a time today, a day this year, a day another year', () => {
    expect(formatWhenShort('2026-10-24T09:05:00Z', now, 'UTC')).toBe('at 9:05 AM');
    expect(formatWhenShort('2026-10-02T09:05:00Z', now, 'UTC')).toBe('on Oct 2');
    expect(formatWhenShort('2025-10-02T09:05:00Z', now, 'UTC')).toBe('on Oct 2, 2025');
    expect(formatWhenShort('', now, 'UTC')).toBe('');
  });

  test('says whether it was your Ack or your last activity', () => {
    expect(describeLastLooked({ lastLookedAt: '2026-10-02T09:00:00Z', lastAckedAt: '2026-10-02T09:00:00Z' }, now, 'UTC')).toBe('since you acked on Oct 2');
    expect(describeLastLooked({ lastLookedAt: '2026-10-02T09:00:00Z', lastAckedAt: '2026-10-01T09:00:00Z' }, now, 'UTC')).toBe(
      'since your last activity on Oct 2',
    );
    expect(describeLastLooked({ lastLookedAt: '', lastAckedAt: '' }, now, 'UTC')).toBe('');
  });
});
