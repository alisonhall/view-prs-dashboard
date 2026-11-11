const { groupRowsByRepo, rowRepoNamesFor, shortRepoNames } = require('./pr-repo-grouping.helpers.ts');

describe('rowRepoNamesFor', () => {
  test('null with rows from one repo: rows do not say it', () => {
    expect(rowRepoNamesFor([{ repo: 'acme/web' }, { repo: 'acme/web' }], 'acme/web')).toBeNull();
  });

  test("a row without a repo is the default repo's, named like any other", () => {
    expect(Object.fromEntries(rowRepoNamesFor([{ repo: 'acme/web' }, { repo: '' }, null], 'acme/api'))).toEqual({
      'acme/web': 'web',
      'acme/api': 'api',
    });
    // Only there: rows all from the default repo, some saying so, are one repo.
    expect(rowRepoNamesFor([{ repo: 'acme/api' }, {}], 'acme/api')).toBeNull();
  });
});

describe('shortRepoNames', () => {
  test('each repo by its name alone, once per repo, ignoring blanks', () => {
    expect([...shortRepoNames(['acme/web', 'acme/api', 'acme/web', '', 'solo'])]).toEqual([
      ['acme/web', 'web'],
      ['acme/api', 'api'],
      ['solo', 'solo'],
    ]);
  });

  test('a name repos from more than one owner share stays in full, for each of them', () => {
    expect(Object.fromEntries(shortRepoNames(['acme/web', 'other/web', 'acme/api']))).toEqual({
      'acme/web': 'acme/web',
      'other/web': 'other/web',
      'acme/api': 'api',
    });
    expect(Object.fromEntries(shortRepoNames(['acme/Web', 'other/web']))).toEqual({ 'acme/Web': 'acme/Web', 'other/web': 'other/web' });
  });
});

describe('groupRowsByRepo', () => {
  const rows = [
    { repo: 'acme/web', id: 1 },
    { repo: 'acme/api', id: 2 },
    { repo: 'acme/web', id: 3 },
  ];

  test('a group per repo, A-Z, each keeping the rows\' order', () => {
    expect(groupRowsByRepo(rows, true)).toEqual([
      { repo: 'acme/api', rows: [rows[1]] },
      { repo: 'acme/web', rows: [rows[0], rows[2]] },
    ]);
  });

  test('one ungrouped group when off, or when the rows all come from one repo', () => {
    expect(groupRowsByRepo(rows, false)).toEqual([{ repo: null, rows }]);
    expect(groupRowsByRepo([rows[0], rows[2]], true)).toEqual([{ repo: null, rows: [rows[0], rows[2]] }]);
  });
});
