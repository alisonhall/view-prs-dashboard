/** @jest-environment jsdom */

import {
  isReviewStatsColumnShown,
  normalizeReviewStatsColumnChoices,
  readStoredReviewStatsColumnChoices,
  REVIEW_STATS_COLUMN_CATALOG,
  REVIEW_STATS_COLUMNS_STORAGE_KEY,
  storeReviewStatsColumnChoices,
  withReviewStatsColumnShown,
} from './review-stats-columns.helpers';

describe('review-stats-columns.helpers', () => {
  test('the least used columns start hidden: Thread comments, Resolved thread comments and Sources', () => {
    expect(REVIEW_STATS_COLUMN_CATALOG.filter((entry) => !entry.defaultShown).map((entry) => entry.label)).toEqual([
      'Thread comments',
      'Resolved thread comments',
      'Sources',
    ]);
    expect(isReviewStatsColumnShown({}, 'comments')).toBe(true);
    expect(isReviewStatsColumnShown({}, 'sources')).toBe(false);
    expect(isReviewStatsColumnShown({ sources: true, comments: false }, 'sources')).toBe(true);
    expect(isReviewStatsColumnShown({ sources: true, comments: false }, 'comments')).toBe(false);
  });

  test('normalizing keeps known columns, booleans only, and only what differs from the defaults', () => {
    expect(
      normalizeReviewStatsColumnChoices({ sources: true, comments: true, prCount: false, reviewer: false, unknown: true, reviews: 'no' }),
    ).toEqual({ sources: true, prCount: false });
    for (const value of [null, undefined, 'x', 3, ['sources']]) {
      expect(normalizeReviewStatsColumnChoices(value)).toEqual({});
    }
  });

  test('a choice back to the default drops out', () => {
    const shown = withReviewStatsColumnShown({}, 'threadComments', true);
    expect(shown).toEqual({ threadComments: true });
    expect(withReviewStatsColumnShown(shown, 'threadComments', false)).toEqual({});
  });

  test('the browser copy round-trips; missing or malformed is no copy', () => {
    window.localStorage.clear();
    expect(readStoredReviewStatsColumnChoices()).toBeNull();
    storeReviewStatsColumnChoices({ sources: true });
    expect(readStoredReviewStatsColumnChoices()).toEqual({ sources: true });
    window.localStorage.setItem(REVIEW_STATS_COLUMNS_STORAGE_KEY, '{not json');
    expect(readStoredReviewStatsColumnChoices()).toBeNull();
  });
});
