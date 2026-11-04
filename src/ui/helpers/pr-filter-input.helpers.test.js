const { parsePrFilterInput, rowMatchesPrFilter, prFilterPicksPrs } = require('./pr-filter-input.helpers.ts');

describe('parsePrFilterInput', () => {
  test('reads numbers, PRs by repo or URL, and repos, comma- or space-separated, each once', () => {
    expect(
      parsePrFilterInput(
        '912, #913 acme/api#7,acme/api#7 https://github.com/acme/web/pull/3/files github.example.com/corp/tool/pull/5 acme/docs junk !/x',
      ),
    ).toEqual({
      prNumbers: ['912', '913'],
      prKeys: ['acme/api#7', 'acme/web#3', 'corp/tool#5'],
      repos: ['acme/docs'],
    });
  });

  test('nothing from an empty field', () => {
    expect(parsePrFilterInput('')).toEqual({ prNumbers: [], prKeys: [], repos: [] });
    expect(parsePrFilterInput(undefined)).toEqual({ prNumbers: [], prKeys: [], repos: [] });
  });
});

describe('rowMatchesPrFilter', () => {
  const matches = (raw, repo, number) => rowMatchesPrFilter(repo, number, parsePrFilterInput(raw));

  test('a number picks that PR in any repo; a key picks just that repo\'s', () => {
    expect(matches('12', 'acme/api', '12')).toBe(true);
    expect(matches('12', 'acme/web', '12')).toBe(true);
    expect(matches('acme/api#12', 'acme/api', '12')).toBe(true);
    expect(matches('acme/api#12', 'acme/web', '12')).toBe(false);
    expect(matches('acme/api#12', 'acme/api', '13')).toBe(false);
  });

  test("a repo keeps its rows; with a number, that repo's PR; a key still names its own repo", () => {
    expect(matches('acme/api', 'acme/api', '1')).toBe(true);
    expect(matches('acme/api', 'acme/web', '1')).toBe(false);
    expect(matches('acme/api 12', 'acme/api', '12')).toBe(true);
    expect(matches('acme/api 12', 'acme/web', '12')).toBe(false);
    expect(matches('acme/api acme/web#3', 'acme/web', '3')).toBe(true);
  });

  test('only numbers and keys pick PRs (which then show whatever the scope)', () => {
    expect(prFilterPicksPrs(parsePrFilterInput('acme/api'))).toBe(false);
    expect(prFilterPicksPrs(parsePrFilterInput('acme/api#1'))).toBe(true);
    expect(prFilterPicksPrs(parsePrFilterInput('4'))).toBe(true);
  });
});

describe('the PRs field, case and repo URLs', () => {
  test("matches repos whatever their case, as GitHub's names do", () => {
    expect(rowMatchesPrFilter('Acme/API', '7', parsePrFilterInput('https://github.com/acme/api/pull/7'))).toBe(true);
    expect(rowMatchesPrFilter('ACME/web', '1', parsePrFilterInput('acme/WEB'))).toBe(true);
    expect(rowMatchesPrFilter('acme/docs', '1', parsePrFilterInput('acme/WEB'))).toBe(false);
  });

  test("takes a repo's own URL as that repo, not just its PRs'", () => {
    expect(parsePrFilterInput('https://github.com/acme/api github.example.com/corp/tool/ acme/api/x').repos).toEqual(['acme/api', 'corp/tool']);
  });
});
