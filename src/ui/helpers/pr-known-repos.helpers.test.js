const { listKnownRepos } = require('./pr-known-repos.helpers.ts');

describe('listKnownRepos', () => {
  test('the subscribed repos, those PRs were added from, and those of the rows, each once and sorted, without the placeholder', () => {
    expect(
      listKnownRepos({
        byPrNumber: {
          'acme/web#1': { repo: 'acme/web' },
          'owner/repo#2': { repo: 'owner/repo' },
          'zeta/z#3': { repo: 'zeta/z' },
        },
        dataMeta: {
          sources: {
            subscriptions: [{ repo: 'acme/web', mode: 'recent' }, { repo: 'acme/api', mode: 'recent' }],
            trackedPrs: [{ repo: 'other/lib', number: '9' }, { repo: 'not a repo', number: '1' }],
          },
        },
      }),
    ).toEqual(['acme/api', 'acme/web', 'other/lib', 'zeta/z']);
  });

  test('nothing without a payload', () => {
    expect(listKnownRepos(null)).toEqual([]);
  });
});
