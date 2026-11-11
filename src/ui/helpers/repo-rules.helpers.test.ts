import {
  groupOfRuleKey,
  normalizeRepoRules,
  repoRulesFor,
  repoRulesKey,
  reposWithRules,
  ruleFieldFromGroup,
  ruleGroupFromValues,
  withRepoRuleGroup,
  withRuleField,
} from './repo-rules.helpers';

describe('per-repo rules', () => {
  test('stored rules are cleaned: a malformed group dropped (so the repo uses every repo\'s), a repo with none left out', () => {
    expect(
      normalizeRepoRules({
        'acme/api': {
          attention: { noActivityMode: 'none', includeDraftNoActivity: true },
          threadResolution: { mode: 'nonsense', allow: ['actor:ann', ' ', 5], deny: 'x' },
          mergeCommitHeadlinePatterns: [' ^Merge\\b ', '', '^Sync'],
          ignoreCommitPatterns: 'not a list',
        },
        'acme/web': { attention: 'broken' },
        ' ': { attention: {} },
        'acme/ui': { ignoreCommitPatterns: [] },
      }),
    ).toEqual({
      'acme/api': {
        attention: {
          noActivityMode: 'none',
          includePendingComments: true,
          ignoreMergeOnlyCommits: false,
          includeClosedMerged: true,
          includeDraftChanged: true,
          includeDraftNoActivity: true,
        },
        threadResolution: { mode: 'allow-all', allow: ['actor:ann', '5'], deny: [] },
        mergeCommitHeadlinePatterns: ['^Merge\\b', '^Sync'],
      },
      // An emptied list is kept: "ignore no commits".
      'acme/ui': { ignoreCommitPatterns: [] },
    });
    expect(normalizeRepoRules(null)).toEqual({});
    expect(normalizeRepoRules(['x'])).toEqual({});
  });

  test("a repo's rules are found whatever the case of its name", () => {
    const byRepo = { 'Acme/API': { ignoreCommitPatterns: ['^docs:'] } };
    expect(repoRulesKey(byRepo, 'acme/api')).toBe('Acme/API');
    expect(repoRulesFor(byRepo, ' ACME/api ')).toEqual({ ignoreCommitPatterns: ['^docs:'] });
    expect(repoRulesFor(byRepo, 'acme/web')).toEqual({});
    expect(repoRulesFor(undefined, 'acme/api')).toEqual({});
  });

  test('a group is set or removed whole; a repo left with none goes, and its stored case is kept', () => {
    let byRepo = withRepoRuleGroup({}, 'acme/api', 'ignoreCommitPatterns', ['^docs:']);
    byRepo = withRepoRuleGroup(byRepo, 'ACME/api', 'mergeCommitHeadlinePatterns', ['^Merge']);
    expect(byRepo).toEqual({ 'acme/api': { ignoreCommitPatterns: ['^docs:'], mergeCommitHeadlinePatterns: ['^Merge'] } });
    byRepo = withRepoRuleGroup(byRepo, 'acme/api', 'ignoreCommitPatterns', undefined);
    expect(byRepo).toEqual({ 'acme/api': { mergeCommitHeadlinePatterns: ['^Merge'] } });
    expect(withRepoRuleGroup(byRepo, 'acme/api', 'mergeCommitHeadlinePatterns', undefined)).toEqual({});
    expect(reposWithRules({ 'b/two': {}, 'A/one': {} })).toEqual(['A/one', 'b/two']);
  });

  test("a repo's own rules start as every repo's", () => {
    const values = {
      attentionNoActivityMode: 'mine-only',
      attentionIncludePendingComments: false,
      attentionIgnoreMergeOnlyCommits: true,
      attentionIncludeClosedMerged: false,
      attentionIncludeDraftChanged: false,
      attentionIncludeDraftNoActivity: true,
      attentionAuthorThreadResolutionMode: 'deny-only',
      mergeCommitHeadlinePatterns: '^Merge\\b\n\n ^Sync ',
      changeFilterIgnoreCommitPatterns: '^docs:',
    };
    const picks = { allow: new Set(['actor:ann']), deny: ['actor:bob'] };
    expect(ruleGroupFromValues('attention', values, picks)).toEqual({
      noActivityMode: 'mine-only',
      includePendingComments: false,
      ignoreMergeOnlyCommits: true,
      includeClosedMerged: false,
      includeDraftChanged: false,
      includeDraftNoActivity: true,
    });
    expect(ruleGroupFromValues('threadResolution', values, picks)).toEqual({ mode: 'deny-only', allow: ['actor:ann'], deny: ['actor:bob'] });
    expect(ruleGroupFromValues('mergeCommitHeadlinePatterns', values, picks)).toEqual(['^Merge\\b', '^Sync']);
    expect(ruleGroupFromValues('ignoreCommitPatterns', values, picks)).toEqual(['^docs:']);
    // Before the merge patterns were ever set: the default.
    expect(ruleGroupFromValues('mergeCommitHeadlinePatterns', {}, picks)).toEqual(['^Merge\\b']);
  });

  test("a control's value in a repo's rules, and changing it", () => {
    const rules = {
      attention: {
        noActivityMode: 'all',
        includePendingComments: true,
        ignoreMergeOnlyCommits: false,
        includeClosedMerged: true,
        includeDraftChanged: true,
        includeDraftNoActivity: false,
      },
      threadResolution: { mode: 'allow-all', allow: [], deny: [] },
      ignoreCommitPatterns: ['^docs:', '^test:'],
    };
    expect(ruleFieldFromGroup(rules, 'attentionNoActivityMode')).toBe('all');
    expect(ruleFieldFromGroup(rules, 'changeFilterIgnoreCommitPatterns')).toBe('^docs:\n^test:');
    expect(withRuleField(rules, 'attentionIncludeDraftChanged', false).attention?.includeDraftChanged).toBe(false);
    expect(withRuleField(rules, 'attentionAuthorThreadResolutionMode', 'allow-only').threadResolution?.mode).toBe('allow-only');
    // Kept as typed while editing - a line being written can be blank.
    expect(withRuleField(rules, 'changeFilterIgnoreCommitPatterns', '^docs:\n').ignoreCommitPatterns).toEqual(['^docs:', '']);
    expect(groupOfRuleKey('attentionIncludeClosedMerged')).toBe('attention');
    expect(groupOfRuleKey('mergeCommitLogins')).toBeNull();
    expect(groupOfRuleKey('changeFilterIgnoreCommitPatterns')).toBe('ignoreCommitPatterns');
  });
});
