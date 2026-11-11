import {
  STARTER_FILTER_VIEWS,
  describeViewFilters,
  hasAnyFilter,
  isSameFilters,
  readSavedFilterViews,
  toSavedFilterViewsValue,
  toViewFilters,
} from './saved-filter-views.helpers.ts';

describe('toViewFilters', () => {
  test('every field (its default when missing or of the wrong kind) and each list trimmed, each value once', () => {
    const filters = toViewFilters(
      { onlyWaitingOnMe: true, filterSearch: '  parser ', onlyNeedsAttention: 'yes', filterStories: 3, unrelated: 'x' },
      { 'author-list': new Set(['ann', ' ann', '']), 'label-list': ['bug'], 'other-list': ['x'] },
    );
    expect(filters.fields).toMatchObject({ onlyWaitingOnMe: true, filterSearch: 'parser', onlyNeedsAttention: false, filterStories: '' });
    expect(filters.fields).not.toHaveProperty('unrelated');
    expect(filters.lists).toEqual({ 'repo-list': [], 'label-list': ['bug'], 'exclude-label-list': [], 'author-list': ['ann'], 'assigned-list': [], 'approver-list': [] });
  });
});

describe('isSameFilters and hasAnyFilter', () => {
  test('the same fields, and each list the same values in any order', () => {
    const a = toViewFilters({ onlyWaitingOnMe: true }, { 'label-list': ['bug', 'docs'] });
    expect(isSameFilters(a, toViewFilters({ onlyWaitingOnMe: true }, { 'label-list': ['docs', 'bug'] }))).toBe(true);
    expect(isSameFilters(a, toViewFilters({ onlyWaitingOnMe: true }, { 'label-list': ['bug'] }))).toBe(false);
    expect(isSameFilters(a, toViewFilters({}, { 'label-list': ['bug', 'docs'] }))).toBe(false);
  });

  test('any filter at all', () => {
    expect(hasAnyFilter(toViewFilters({}, {}))).toBe(false);
    expect(hasAnyFilter(toViewFilters({ filterPrDifficulty: '3' }, {}))).toBe(true);
  });
});

describe('describeViewFilters', () => {
  test('as the filter chips say them', () => {
    expect(describeViewFilters(toViewFilters({ onlyWaitingOnMe: true, filterSearch: 'parser' }, { 'author-list': ['ann'] }))).toEqual([
      'Search: parser',
      'Waiting on me',
      'Author: ann',
    ]);
  });
});

describe('readSavedFilterViews', () => {
  test('the starter views until any were saved - even none', () => {
    expect(readSavedFilterViews({})).toEqual(STARTER_FILTER_VIEWS);
    expect(readSavedFilterViews(null)).toEqual(STARTER_FILTER_VIEWS);
    expect(readSavedFilterViews({ savedFilterViews: { views: [] } })).toEqual([]);
  });

  test('drops entries without a name, and makes ids unique', () => {
    const views = readSavedFilterViews({
      savedFilterViews: {
        views: [
          { id: 'a', name: ' Mine ', filters: { fields: { onlyWaitingOnMe: true }, lists: { 'author-list': ['ann'], 'label-list': 'bug' } } },
          { id: 'a', name: 'Copy' },
          { name: '' },
          'junk',
        ],
      },
    });
    expect(views.map((view) => [view.id, view.name])).toEqual([
      ['a', 'Mine'],
      ['a-1', 'Copy'],
    ]);
    expect(views[0]?.filters.lists).toMatchObject({ 'author-list': ['ann'], 'label-list': [] });
  });

  test('read back as written', () => {
    expect(readSavedFilterViews({ savedFilterViews: toSavedFilterViewsValue(STARTER_FILTER_VIEWS) })).toEqual(STARTER_FILTER_VIEWS);
  });
});
