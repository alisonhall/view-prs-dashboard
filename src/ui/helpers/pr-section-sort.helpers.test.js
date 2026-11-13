const { defaultSectionSort, holdRowOrder, sectionSortFields, sortSectionRows, prCreatedAt, isSectionSort } = require('./pr-section-sort.helpers.ts');

const row = (number, data = {}) => ({ prNumber: String(number), repo: 'acme/api', data: { number: String(number), ...data } });
const numbers = (rows) => rows.map((entry) => entry.data.number);

describe('section sorting', () => {
  test('defaults: merged by date merged, closed by date closed, the rest by date created - newest first', () => {
    expect(defaultSectionSort('merged')).toEqual({ by: 'merged', direction: 'desc' });
    expect(defaultSectionSort('closed')).toEqual({ by: 'closed', direction: 'desc' });
    expect(defaultSectionSort('open')).toEqual({ by: 'created', direction: 'desc' });
    expect(defaultSectionSort('needs-attention')).toEqual({ by: 'created', direction: 'desc' });
    expect(defaultSectionSort('custom-abc')).toEqual({ by: 'created', direction: 'desc' });
  });

  test('a date to sort by only where every PR has one', () => {
    expect(sectionSortFields('merged')).toEqual(['created', 'number', 'updated', 'merged']);
    expect(sectionSortFields('closed')).toEqual(['created', 'number', 'updated', 'closed']);
    expect(sectionSortFields('flagged')).toEqual(['created', 'number', 'updated']);
  });

  test("sorts by date created: the row's own, else its opened event's (rows saved before it was kept), those with neither last", () => {
    const opened = (at) => ({ activityEvents: [{ type: 'commented', occurredAt: '2026-12-01T00:00:00Z' }, { type: 'opened', occurredAt: at }] });
    const rows = [
      row(1, { createdAt: '2026-10-05T00:00:00Z' }),
      row(2, opened('2026-10-20T00:00:00Z')),
      row(3, {}),
      row(4, { createdAt: '2026-10-10T00:00:00Z', ...opened('2026-01-01T00:00:00Z') }),
    ];
    expect(sortSectionRows(rows, { by: 'created', direction: 'desc' }).map((entry) => entry.prNumber)).toEqual(['2', '4', '1', '3']);
    expect(sortSectionRows(rows, { by: 'created', direction: 'asc' }).map((entry) => entry.prNumber)).toEqual(['1', '4', '2', '3']);
    expect(prCreatedAt(rows[1])).toBe('2026-10-20T00:00:00Z');
    expect(prCreatedAt(rows[2])).toBe('');
    expect(isSectionSort({ by: 'created', direction: 'asc' })).toBe(true);
  });

  test("works out each row's value once, not for every comparison", () => {
    let reads = 0;
    const rows = Array.from({ length: 50 }, (_, index) => {
      const entry = row(index + 1, {});
      Object.defineProperty(entry.data, "activityEvents", {
        get: () => {
          reads += 1;
          return [{ type: "opened", occurredAt: `2026-10-${String((index % 28) + 1).padStart(2, "0")}T00:00:00Z` }];
        },
      });
      return entry;
    });
    sortSectionRows(rows, { by: "created", direction: "desc" });
    expect(reads).toBe(rows.length);
  });

  test('sorts a copy by PR number or a date, either way', () => {
    const rows = [
      row(2, { mergedAt: '2026-11-01T00:00:00Z', sourceUpdatedAt: '2026-11-03T00:00:00Z' }),
      row(10, { mergedAt: '2026-10-01T00:00:00Z', sourceUpdatedAt: '2026-11-04T00:00:00Z' }),
      row(7, { mergedAt: '2026-11-02T00:00:00Z', sourceUpdatedAt: '2026-11-01T00:00:00Z' }),
    ];

    expect(numbers(sortSectionRows(rows, { by: 'number', direction: 'desc' }))).toEqual(['10', '7', '2']);
    expect(numbers(sortSectionRows(rows, { by: 'number', direction: 'asc' }))).toEqual(['2', '7', '10']);
    expect(numbers(sortSectionRows(rows, { by: 'merged', direction: 'desc' }))).toEqual(['7', '2', '10']);
    expect(numbers(sortSectionRows(rows, { by: 'updated', direction: 'asc' }))).toEqual(['7', '2', '10']);
    expect(numbers(rows)).toEqual(['2', '10', '7']);
  });

  test('rows without the date go last whichever way, and ties go to the higher PR number', () => {
    const rows = [row(1), row(3, { mergedAt: '2026-11-01T00:00:00Z' }), row(2, { mergedAt: '2026-11-01T00:00:00Z' }), row(4)];

    expect(numbers(sortSectionRows(rows, { by: 'merged', direction: 'desc' }))).toEqual(['3', '2', '4', '1']);
    expect(numbers(sortSectionRows(rows, { by: 'merged', direction: 'asc' }))).toEqual(['3', '2', '4', '1']);
  });
});

describe('holdRowOrder', () => {
  const keyOf = (entry) => entry.data.number;

  test('keeps the rows in the order shown, whatever the sort now says', () => {
    expect(numbers(holdRowOrder([row(3), row(1), row(2)], ['1', '2', '3'], keyOf))).toEqual(['1', '2', '3']);
  });

  test('leaves out rows no longer there, and puts new ones where the sort does among the rest', () => {
    // Sorted 5, 3, 4, 1, 6; shown 1, 3, (2 gone). 5 goes above 3 (the next
    // shown row after it in the sort), 4 above 1, and 6 at the end.
    expect(numbers(holdRowOrder([row(5), row(3), row(4), row(1), row(6)], ['1', '3', '2'], keyOf))).toEqual(['4', '1', '5', '3', '6']);
  });

  test('nothing shown before: the sorted order', () => {
    expect(numbers(holdRowOrder([row(2), row(1)], [], keyOf))).toEqual(['2', '1']);
  });
});
