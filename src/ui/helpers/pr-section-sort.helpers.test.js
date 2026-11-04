const {
  defaultSectionSort,
  sectionSortFields,
  sortSectionRows,
} = require('./pr-section-sort.helpers.ts');

const row = (number, data = {}) => ({ prNumber: String(number), repo: 'acme/api', data: { number: String(number), ...data } });
const numbers = (rows) => rows.map((entry) => entry.data.number);

describe('section sorting', () => {
  test('defaults: merged by date merged, closed by date closed, the rest by PR number - newest first', () => {
    expect(defaultSectionSort('merged')).toEqual({ by: 'merged', direction: 'desc' });
    expect(defaultSectionSort('closed')).toEqual({ by: 'closed', direction: 'desc' });
    expect(defaultSectionSort('open')).toEqual({ by: 'number', direction: 'desc' });
    expect(defaultSectionSort('needs-attention')).toEqual({ by: 'number', direction: 'desc' });
  });

  test('a date to sort by only where every PR has one', () => {
    expect(sectionSortFields('merged')).toEqual(['number', 'updated', 'merged']);
    expect(sectionSortFields('closed')).toEqual(['number', 'updated', 'closed']);
    expect(sectionSortFields('flagged')).toEqual(['number', 'updated']);
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
