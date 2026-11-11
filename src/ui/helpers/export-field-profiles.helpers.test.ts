import {
  countFields,
  describeExportFields,
  isSameFields,
  readExportFieldProfiles,
  toExportFieldProfilesValue,
  toExportFields,
} from './export-field-profiles.helpers.ts';

describe('toExportFields', () => {
  test('each source as strings, trimmed, each once; none when missing or not a list', () => {
    expect(toExportFields({ dataPaths: [' title ', 'title', 7, '', null], userStatePaths: 'notes' })).toEqual({
      dataPaths: ['title', '7'],
      userStatePaths: [],
    });
    expect(toExportFields(null)).toEqual({ dataPaths: [], userStatePaths: [] });
  });
});

describe('isSameFields', () => {
  test('the same paths of each source, in any order', () => {
    const fields = { dataPaths: ['a', 'b'], userStatePaths: ['n'] };
    expect(isSameFields(fields, { dataPaths: ['b', 'a'], userStatePaths: ['n'] })).toBe(true);
    expect(isSameFields(fields, { dataPaths: ['a'], userStatePaths: ['n'] })).toBe(false);
    // The same path from the other source isn't the same field.
    expect(isSameFields(fields, { dataPaths: ['a', 'b', 'n'], userStatePaths: [] })).toBe(false);
  });
});

test('countFields and describeExportFields', () => {
  expect(countFields({ dataPaths: ['a', 'b'], userStatePaths: ['n'] })).toBe(3);
  expect(describeExportFields({ dataPaths: ['prNumber', 'title'], userStatePaths: ['notesByPrNumber'] })).toBe(
    'Data: prNumber, title · User state: notesByPrNumber',
  );
  expect(describeExportFields({ dataPaths: [], userStatePaths: ['n'] })).toBe('User state: n');
  expect(describeExportFields({ dataPaths: [], userStatePaths: [] })).toBe('No fields');
  // Six are each named; past that, the counts and the first three.
  expect(describeExportFields({ dataPaths: ['a', 'b', 'c', 'd', 'e'], userStatePaths: ['n'] })).toBe('Data: a, b, c, d, e · User state: n');
  expect(describeExportFields({ dataPaths: ['a', 'b'], userStatePaths: ['n', 'o', 'p', 'q', 'r'] })).toBe(
    '7 fields (2 data, 5 user state): a, b, n +4 more',
  );
});

describe('readExportFieldProfiles', () => {
  test('none until any were saved; read back as written', () => {
    expect(readExportFieldProfiles({})).toEqual([]);
    expect(readExportFieldProfiles(null)).toEqual([]);
    const profiles = [{ id: 'p1', name: 'Titles', dataPaths: ['title'], userStatePaths: [] }];
    expect(readExportFieldProfiles({ exportFieldProfiles: toExportFieldProfilesValue(profiles) })).toEqual(profiles);
  });

  test('keeps only what a profile has', () => {
    expect(
      readExportFieldProfiles({ exportFieldProfiles: { profiles: [{ id: 'p', name: 'X', dataPaths: ['a'], extra: true }] } }),
    ).toEqual([{ id: 'p', name: 'X', dataPaths: ['a'], userStatePaths: [] }]);
  });
});
