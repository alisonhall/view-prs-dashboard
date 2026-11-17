import {
  ARCHIVED_ONLY_GROUP,
  archivedCount,
  archivedEntryKeys,
  archivedFacets,
  mergeArchivedRows,
  picksArchivedOnlyOption,
  reviewStatsReachesArchive,
  splitArchivedCount,
  tableArchiveSections,
} from './pr-archive.helpers';
import { normalizeFilterToken } from './pr-filter-label-extraction.helpers';
import type { ArchivedSection } from './pr-archive.helpers';
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

describe('tableArchiveSections', () => {
  const shown: ReadonlySet<ArchivedSection> = new Set(['closed']);

  test("gives the sections whose Show older was pressed, or every one while the search or PR number field isn't empty", () => {
    expect(tableArchiveSections(shown, { filterSearch: '', filterPrNumbers: '' })).toBe(shown);
    expect(tableArchiveSections(shown, { filterSearch: '   ' })).toBe(shown);
    expect(tableArchiveSections(shown, undefined)).toBe(shown);
    expect([...tableArchiveSections(shown, { filterSearch: 'parser' })].sort()).toEqual(['closed', 'merged']);
    expect([...tableArchiveSections(new Set(), { filterPrNumbers: '901' })].sort()).toEqual(['closed', 'merged']);
  });

  test('gives the same set each time while searching, so the table does not rebuild', () => {
    expect(tableArchiveSections(shown, { filterSearch: 'a' })).toBe(tableArchiveSections(new Set(), { filterSearch: 'b' }));
  });

  test('gives every one while an author or label only archived PRs have is ticked', () => {
    expect([...tableArchiveSections(new Set(), { filterSearch: '' }, true)].sort()).toEqual(['closed', 'merged']);
    expect(tableArchiveSections(shown, { filterSearch: '' }, false)).toBe(shown);
  });
});

describe('archivedFacets', () => {
  const summary = {
    authors: [
      { repo: 'o/r', login: 'old-dev', name: 'Old Dev' },
      { repo: 'o/lib', login: 'lib-dev', name: '' },
    ],
    labels: [{ repo: 'o/lib', name: 'legacy' }],
  };

  test("gives the archived authors and labels, a repo's when given", () => {
    expect(archivedFacets(summary)).toEqual({ authors: summary.authors, labels: summary.labels });
    expect(archivedFacets(summary, 'o/r')).toEqual({ authors: [summary.authors[0]], labels: [] });
  });

  test('gives none from a summary without them (one from before they were added)', () => {
    expect(archivedFacets({ merged: 3 })).toEqual({ authors: [], labels: [] });
    expect(archivedFacets(undefined, 'o/r')).toEqual({ authors: [], labels: [] });
  });
});

describe('picksArchivedOnlyOption', () => {
  const options = [
    { value: 'current-dev', label: 'Current Dev', group: 'Everyone else' },
    { value: 'old-dev', label: 'Old Dev', group: ARCHIVED_ONLY_GROUP },
  ];

  test('says whether a ticked option is one only archived PRs have', () => {
    expect(picksArchivedOnlyOption(options, new Set(['old-dev']))).toBe(true);
    expect(picksArchivedOnlyOption(options, new Set(['current-dev', 'old-dev']))).toBe(true);
    expect(picksArchivedOnlyOption(options, new Set(['current-dev']))).toBe(false);
    expect(picksArchivedOnlyOption(options, new Set())).toBe(false);
    expect(picksArchivedOnlyOption(options, undefined)).toBe(false);
  });

  test('matches with the given normalizing, as the label lists do', () => {
    const labels = [{ value: 'Legacy', label: 'Legacy', group: ARCHIVED_ONLY_GROUP }];
    expect(picksArchivedOnlyOption(labels, new Set(['legacy']))).toBe(false);
    expect(picksArchivedOnlyOption(labels, new Set(['legacy']), normalizeFilterToken)).toBe(true);
  });
});

describe('splitArchivedCount', () => {
  const payload = {
    ok: true,
    byPrNumber: {
      'o/r#1': row('1', 'open'),
      'o/r#2': row('2', 'merged'),
      'o/r#501': row('501', 'merged', { archived: true }),
      'o/r#502': row('502', 'closed', { archived: true }),
    },
  } as unknown as PrDataPayload;

  test("takes the archived rows the table has out of both counts, and counts those shown apart", () => {
    const keys = archivedEntryKeys(payload);
    expect([...keys].sort()).toEqual(['o/r#501', 'o/r#502']);
    expect(splitArchivedCount(['o/r#1', 'o/r#501'], 4, keys)).toEqual({ shown: 1, total: 2, archivedShown: 1 });
    expect(splitArchivedCount(['o/r#1', 'o/r#2'], 4, keys)).toEqual({ shown: 2, total: 2, archivedShown: 0 });
  });

  test('without archived rows, the counts are as given', () => {
    expect(splitArchivedCount(['o/r#1'], 2, new Set())).toEqual({ shown: 1, total: 2, archivedShown: 0 });
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
