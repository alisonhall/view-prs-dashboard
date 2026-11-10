/** @jest-environment jsdom */

// Settings › Rules for a repo, where the rules are used: Needs Attention
// (with the merge-commit rules) and the Conversations tab's thread policy
// follow a PR's repo's own rules (repo-rules.helpers.ts).
import { render } from '@testing-library/react';
import { NeedsAttentionProvider } from '../components/NeedsAttentionProvider';
import { FilterStateContext } from './FilterStateContext';
import { useNeedsAttention } from './NeedsAttentionContext';
import { AuthorThreadResolutionSelectionContext } from './AuthorThreadResolutionSelectionContext';
import { useAuthorThreadResolutionPolicy } from './useAuthorThreadResolutionPolicy';
import { attentionConfigForRepo, type AttentionConfig } from '../helpers/pr-needs-attention.helpers.ts';
import type { ThreadResolutionPolicy } from '../helpers/pr-review-threads.helpers.ts';

const VALUES = {
  attentionNoActivityMode: 'all',
  attentionIncludePendingComments: true,
  attentionIgnoreMergeOnlyCommits: false,
  attentionIncludeClosedMerged: true,
  attentionIncludeDraftChanged: true,
  attentionIncludeDraftNoActivity: false,
  attentionAuthorThreadResolutionMode: 'deny-only',
  mergeCommitHeadlinePatterns: '^Merge\\b',
  mergeCommitLogins: 'merge-bot',
  repoRules: {
    'Acme/Quiet': {
      attention: {
        noActivityMode: 'none',
        includePendingComments: true,
        ignoreMergeOnlyCommits: true,
        includeClosedMerged: false,
        includeDraftChanged: false,
        includeDraftNoActivity: false,
      },
      threadResolution: { mode: 'allow-only', allow: ['ann'], deny: [] },
    },
    'acme/sync': { mergeCommitHeadlinePatterns: ['^Sync', ''] },
  },
};

const filterState = { values: VALUES, setValue: () => {}, restoredRepoOverride: null, persistRunScriptOptions: () => {} };

describe('per-repo rules in use', () => {
  test("Needs Attention: each repo with its own rules gets the every-repo config with them laid over it; the merge logins stay for every repo", () => {
    let config: AttentionConfig = {};
    function Probe() {
      config = useNeedsAttention().attentionConfig;
      return null;
    }
    render(
      <FilterStateContext.Provider value={filterState as never}>
        <NeedsAttentionProvider>
          <Probe />
        </NeedsAttentionProvider>
      </FilterStateContext.Provider>,
    );

    const quiet = attentionConfigForRepo(config, 'acme/quiet');
    expect(quiet.noActivityMode).toBe('none');
    expect(quiet.ignoreMergeOnlyCommits).toBe(true);
    expect(quiet.mergeCommitRules).toEqual({ headlinePatterns: ['^Merge\\b'], logins: ['merge-bot'] });

    const sync = attentionConfigForRepo(config, 'acme/sync');
    expect(sync.noActivityMode).toBe('all');
    expect(sync.mergeCommitRules).toEqual({ headlinePatterns: ['^Sync'], logins: ['merge-bot'] });

    const other = attentionConfigForRepo(config, 'acme/other');
    expect(other.noActivityMode).toBe('all');
    expect(other.mergeCommitRules).toEqual({ headlinePatterns: ['^Merge\\b'], logins: ['merge-bot'] });
  });

  test("the Conversations tab's thread policy: the PR's repo's own, else every repo's", () => {
    const policies: Record<string, ThreadResolutionPolicy> = {};
    function Probe({ repo }: { repo: string }) {
      policies[repo] = useAuthorThreadResolutionPolicy(repo);
      return null;
    }
    const selection = {
      checkedByListId: { 'attention-author-thread-resolution-deny-list': new Set(['bob']) },
      toggle: () => {},
      setChecked: () => {},
    };
    render(
      <FilterStateContext.Provider value={filterState as never}>
        <AuthorThreadResolutionSelectionContext.Provider value={selection as never}>
          <Probe repo="acme/quiet" />
          <Probe repo="acme/other" />
        </AuthorThreadResolutionSelectionContext.Provider>
      </FilterStateContext.Provider>,
    );

    const quiet = policies['acme/quiet']!;
    const other = policies['acme/other']!;
    expect(quiet.mode).toBe('allow-only');
    expect(Array.from(quiet.allowLoginKeys)).toEqual(['ann']);
    expect(Array.from(quiet.denyLoginKeys)).toEqual([]);
    expect(other.mode).toBe('deny-only');
    expect(Array.from(other.denyLoginKeys)).toEqual(['bob']);
  });
});
