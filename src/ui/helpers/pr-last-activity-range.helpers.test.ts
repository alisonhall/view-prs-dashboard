import {
  describeLastActivityRange,
  isInLastActivityRange,
  isLastActivityRangeReversed,
  lastActivityRangeBounds,
  parseDateInputValue,
} from './pr-last-activity-range.helpers';
import type { PrEntry } from '../types/pr-data';

// A PR last updated at this local time (the browser's zone, as the filter).
const updatedAt = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0, ms = 0): PrEntry =>
  ({ data: { sourceUpdatedAt: new Date(year, month - 1, day, hour, minute, second, ms).toISOString() } }) as PrEntry;

describe('the Last activity range', () => {
  test('a date input value is the start of that day here; anything else is no date', () => {
    expect(parseDateInputValue('2026-11-03')).toBe(new Date(2026, 10, 3).getTime());
    expect(parseDateInputValue(' 2026-11-03 ')).toBe(new Date(2026, 10, 3).getTime());
    ['', null, undefined, '2026-02-30', '2026-13-01', '11/03/2026', '2026-11-3'].forEach((value) => {
      expect(parseDateInputValue(value)).toBeNull();
    });
  });

  test('both days count in full: from the start of the first to the last moment of the last', () => {
    expect(lastActivityRangeBounds('2026-11-01', '2026-11-10')).toEqual({
      fromMs: new Date(2026, 10, 1).getTime(),
      toMs: new Date(2026, 10, 11).getTime() - 1,
    });
    const from = '2026-11-01';
    const to = '2026-11-10';
    expect(isInLastActivityRange(updatedAt(2026, 11, 1, 0, 0, 0, 0), from, to)).toBe(true);
    expect(isInLastActivityRange(updatedAt(2026, 11, 10, 23, 59, 59, 999), from, to)).toBe(true);
    expect(isInLastActivityRange(updatedAt(2026, 10, 31, 23, 59, 59, 999), from, to)).toBe(false);
    expect(isInLastActivityRange(updatedAt(2026, 11, 11, 0, 0, 0, 0), from, to)).toBe(false);
  });

  test('an empty start or end puts no limit on that side', () => {
    expect(isInLastActivityRange(updatedAt(2001, 1, 1), '', '2026-11-10')).toBe(true);
    expect(isInLastActivityRange(updatedAt(2026, 11, 11), '', '2026-11-10')).toBe(false);
    expect(isInLastActivityRange(updatedAt(2099, 1, 1), '2026-11-01', '')).toBe(true);
    expect(isInLastActivityRange(updatedAt(2026, 10, 31), '2026-11-01', '')).toBe(false);
    expect(isInLastActivityRange(updatedAt(2026, 10, 31), '', '')).toBe(true);
  });

  test("an impossible date is no limit, rather than matching nothing", () => {
    expect(isInLastActivityRange(updatedAt(2026, 3, 5), '2026-02-30', '')).toBe(true);
  });

  test("the last activity is the latest of the PR's update, merge and close times", () => {
    const entry = {
      data: {
        sourceUpdatedAt: new Date(2026, 10, 1).toISOString(),
        mergedAt: new Date(2026, 10, 5).toISOString(),
      },
    } as PrEntry;
    expect(isInLastActivityRange(entry, '2026-11-04', '')).toBe(true);
  });

  test('with a limit, a PR without any activity time matches nothing; without one, it shows', () => {
    const noTime = { data: {} } as PrEntry;
    expect(isInLastActivityRange(noTime, '2026-11-01', '')).toBe(false);
    expect(isInLastActivityRange(noTime, '', '2026-11-01')).toBe(false);
    expect(isInLastActivityRange(noTime, '', '')).toBe(true);
  });

  test('a start after the end is reversed, and nothing matches it', () => {
    expect(isLastActivityRangeReversed('2026-11-10', '2026-11-01')).toBe(true);
    expect(isLastActivityRangeReversed('2026-11-10', '2026-11-10')).toBe(false);
    expect(isLastActivityRangeReversed('2026-11-10', '')).toBe(false);
    expect(isInLastActivityRange(updatedAt(2026, 11, 5), '2026-11-10', '2026-11-01')).toBe(false);
  });

  test("the chip's words: a range, a start only, an end only, or nothing", () => {
    expect(describeLastActivityRange('2026-11-01', '2026-11-10')).toBe('Last activity: Nov 1, 2026 – Nov 10, 2026');
    expect(describeLastActivityRange('2026-11-01', '')).toBe('Last activity: from Nov 1, 2026');
    expect(describeLastActivityRange('', '2026-11-10')).toBe('Last activity: until Nov 10, 2026');
    expect(describeLastActivityRange('', '')).toBe('');
    expect(describeLastActivityRange('nonsense', '')).toBe('');
  });
});
