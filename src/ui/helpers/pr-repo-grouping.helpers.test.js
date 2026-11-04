const { groupRowsByRepo } = require('./pr-repo-grouping.helpers.ts');

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
