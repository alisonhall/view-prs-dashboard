import { archivedCount, mergeArchivedRows, reviewStatsReachesArchive } from './pr-archive.helpers';
import type { PrDataPayload, PrEntry } from '../types/pr-data';

const row = (number: string, section: PrEntry['section'], extra: Partial<PrEntry> = {}): PrEntry => ({
  prNumber: number,
  repo: 'o/r',
  section,
  data: { number, title: `PR ${number}` },
  ...extra,
});

describe('archivedCount', () => {
  test('counts a section, or both, and treats missing counts as none', () => {
    expect(archivedCount({ merged: 3, closed: 2 })).toBe(5);
    expect(archivedCount({ merged: 3, closed: 2 }, 'closed')).toBe(2);
    expect(archivedCount(undefined)).toBe(0);
    expect(archivedCount({ version: 'v' }, 'merged')).toBe(0);
  });
});

describe('mergeArchivedRows', () => {
  const payload: PrDataPayload = { byPrNumber: { 'o/r#1': row('1', 'open'), 'o/r#2': row('2', 'merged') } };
  const archived = {
    'o/r#2': row('2', 'merged', { data: { number: '2', title: 'Archived copy' } }),
    'o/r#3': row('3', 'merged', { archived: true }),
    'o/r#4': row('4', 'closed', { archived: true }),
  };

  test("adds the archived rows, marked archived; a PR the payload has stays the payload's", () => {
    const merged = mergeArchivedRows(payload, archived);
    expect(Object.keys(merged.byPrNumber || {}).sort()).toEqual(['o/r#1', 'o/r#2', 'o/r#3', 'o/r#4']);
    expect(merged.byPrNumber?.['o/r#2']).toBe(payload.byPrNumber?.['o/r#2']);
    expect(merged.byPrNumber?.['o/r#3']?.archived).toBe(true);
    // Rows already marked keep their identity (row caches key on it).
    expect(merged.byPrNumber?.['o/r#3']).toBe(archived['o/r#3']);
  });

  test("adds only the given sections' rows", () => {
    const merged = mergeArchivedRows(payload, archived, new Set(['closed']));
    expect(Object.keys(merged.byPrNumber || {}).sort()).toEqual(['o/r#1', 'o/r#2', 'o/r#4']);
  });

  test("gives the same payload when there's nothing to add", () => {
    expect(mergeArchivedRows(payload, null)).toBe(payload);
    expect(mergeArchivedRows(payload, {})).toBe(payload);
    expect(mergeArchivedRows(payload, archived, new Set())).toBe(payload);
    expect(mergeArchivedRows(payload, { 'o/r#2': archived['o/r#2'] })).toBe(payload);
  });
});

describe('reviewStatsReachesArchive', () => {
  const summary = { merged: 2, closed: 0, newestEventAt: '2026-08-10T12:00:00Z' };

  test('reaches it with no start date, or one on or before the newest day their events can be on', () => {
    expect(reviewStatsReachesArchive(summary, '')).toBe(true);
    expect(reviewStatsReachesArchive(summary, undefined)).toBe(true);
    expect(reviewStatsReachesArchive(summary, '2026-08-10')).toBe(true);
    expect(reviewStatsReachesArchive(summary, '2026-05-01')).toBe(true);
    expect(reviewStatsReachesArchive(summary, '2026-08-11')).toBe(false);
  });

  test("doesn't with nothing archived; does when the newest date is unknown", () => {
    expect(reviewStatsReachesArchive({ merged: 0, closed: 0 }, '')).toBe(false);
    expect(reviewStatsReachesArchive(undefined, '')).toBe(false);
    expect(reviewStatsReachesArchive({ merged: 1 }, '2026-08-11')).toBe(true);
  });
});
