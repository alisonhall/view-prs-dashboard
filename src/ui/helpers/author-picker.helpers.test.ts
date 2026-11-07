import {
  RECENTLY_ACTIVE_DAYS,
  getAuthorPrState,
  getPrLastActivityTime,
  groupAuthorOptionsByActivity,
  summarizeAuthorActivity,
  type AuthorActivity,
} from './author-picker.helpers';
import type { PrEntry } from '../types/pr-data';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-07T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();
const entry = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ data, ...extra }) as unknown as PrEntry;
// The login as given, or the name when there's none (as getPreferredActorKey).
const preferredKey = (login: unknown, name: unknown) => String(login || name || '');

describe('author-picker.helpers', () => {
  test('getAuthorPrState: merged, closed (by its close time or the Closed section), else open', () => {
    expect(getAuthorPrState(entry({ mergedAt: daysAgo(1), closedAt: daysAgo(1) }))).toBe('merged');
    expect(getAuthorPrState(entry({ closedAt: daysAgo(1) }))).toBe('closed');
    expect(getAuthorPrState(entry({}, { section: 'closed' }))).toBe('closed');
    expect(getAuthorPrState(entry({}))).toBe('open');
    expect(getAuthorPrState(null)).toBe('open');
  });

  test("getPrLastActivityTime: the latest of the PR's update, merge and close times; -Infinity with none", () => {
    expect(getPrLastActivityTime(entry({ sourceUpdatedAt: daysAgo(5), mergedAt: daysAgo(3), closedAt: daysAgo(4) }))).toBe(NOW - 3 * DAY);
    expect(getPrLastActivityTime(entry({ sourceUpdatedAt: 'not a date' }))).toBe(Number.NEGATIVE_INFINITY);
  });

  test("summarizeAuthorActivity: each author's latest activity and open, merged and closed PRs, by preferred login", () => {
    const activity = summarizeAuthorActivity(
      [
        entry({ authorLogin: 'octocat', sourceUpdatedAt: daysAgo(9) }),
        entry({ authorLogin: 'octocat', mergedAt: daysAgo(2) }),
        entry({ authorLogin: 'octocat', closedAt: daysAgo(20) }),
        entry({ author: 'Hubot', sourceUpdatedAt: daysAgo(40) }),
        entry({}),
      ],
      preferredKey,
    );

    expect([...activity.keys()]).toEqual(['octocat', 'Hubot']);
    expect(activity.get('octocat')).toEqual({ lastActiveAt: NOW - 2 * DAY, open: 1, merged: 1, closed: 1 });
    expect(activity.get('Hubot')).toEqual({ lastActiveAt: NOW - 40 * DAY, open: 1, merged: 0, closed: 0 });
  });

  test(`groupAuthorOptionsByActivity: a PR updated in the last ${RECENTLY_ACTIVE_DAYS} days first, newest first; the rest in the order given`, () => {
    const activity = new Map<string, AuthorActivity>([
      ['a', { lastActiveAt: NOW - 20 * DAY, open: 1, merged: 0, closed: 0 }],
      ['b', { lastActiveAt: NOW - 1 * DAY, open: 1, merged: 0, closed: 0 }],
      ['c', { lastActiveAt: NOW - RECENTLY_ACTIVE_DAYS * DAY, open: 1, merged: 0, closed: 0 }],
      ['d', { lastActiveAt: NOW - (RECENTLY_ACTIVE_DAYS * DAY + 1), open: 1, merged: 0, closed: 0 }],
    ]);
    const options = ['a', 'b', 'c', 'd', 'e'].map((login) => ({ login, name: login.toUpperCase() }));

    const { recent, others } = groupAuthorOptionsByActivity(options, activity, NOW);

    expect(recent.map(({ login }) => login)).toEqual(['b', 'a', 'c']);
    // d just missed it; e (in actorsMap only) has no PRs.
    expect(others.map(({ login }) => login)).toEqual(['d', 'e']);
  });
});
