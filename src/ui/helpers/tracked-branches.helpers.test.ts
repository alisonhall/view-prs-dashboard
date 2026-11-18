import {
  describeBranchChips,
  describeBranchWhere,
  formatCommitAge,
  sortTrackedBranches,
  trackedBranchKey,
  trackedBranchMatches,
} from './tracked-branches.helpers';

const texts = (chips: ReturnType<typeof describeBranchChips>) => chips.map((chip) => chip.text);

describe('tracked branches', () => {
  test('keys are repo:branch', () => {
    expect(trackedBranchKey('acme/app', 'feature/x')).toBe('acme/app:feature/x');
  });

  test("where: its worktree's folder, not checked out, not found, or not on this computer", () => {
    expect(describeBranchWhere(undefined, false).text).toBe('Not on this computer');
    expect(describeBranchWhere(undefined, true).text).toBe('Not read yet');
    expect(describeBranchWhere({ found: false }, true).text).toBe('Branch not found');
    expect(describeBranchWhere({ found: true }, true).text).toBe('Not checked out');
    const where = describeBranchWhere({ found: true, worktreePath: 'D:\\code\\app-wip\\', rebasing: true }, true);
    expect(where).toEqual({ text: 'app-wip', hint: 'Checked out in D:\\code\\app-wip\\ (mid-rebase)' });
  });

  test('a local-only branch with uncommitted changes, ahead of its base', () => {
    const chips = describeBranchChips(
      { found: true, pushed: false, unpushed: 2, base: 'main', baseAhead: 2, baseBehind: 0 },
      { staged: 1, changed: 0, untracked: 2, conflicted: 0, total: 3, files: [{ path: 'a.txt', code: 'A ' }] },
    );
    expect(texts(chips)).toEqual(['3 uncommitted', 'Local only · 2 commits', '2 ahead, 0 behind main']);
    expect(chips[0]?.hint).toBe('Uncommitted: 1 staged, 2 new\nA a.txt');
    expect(chips[2]?.tone).toBe('muted');
  });

  test('a pushed branch behind its upstream and its base; one whose upstream is gone; conflicts; a PR opened', () => {
    expect(
      texts(describeBranchChips({ found: true, pushed: true, unpushed: 0, upstream: { remote: 'origin', branch: 'x', ahead: 0, behind: 3 }, base: 'development', baseAhead: 1, baseBehind: 4 })),
    ).toEqual(['3 behind', '1 ahead, 4 behind development']);
    expect(texts(describeBranchChips({ found: true, pushed: false, unpushed: 1, upstream: { remote: 'origin', branch: 'x', gone: true } }))).toEqual([
      '1 not pushed',
      'Remote branch gone',
    ]);
    expect(texts(describeBranchChips({ found: true, base: 'main', baseMissing: true }, { conflicted: 2, total: 2 }))).toEqual([
      '2 conflicts',
      '2 uncommitted',
      'No main',
    ]);
    expect(texts(describeBranchChips({ found: true, pr: { number: '12', done: false }, pushed: true, unpushed: 0, upstream: { remote: 'origin', branch: 'x', ahead: 0, behind: 0 } }))).toEqual(['PR #12 opened']);
    expect(texts(describeBranchChips({ found: true, pushed: true, unpushed: 0 }))).toEqual(['On a remote branch']);
    // Commits of its own on a remote branch, tracking none: said so. Still
    // where its base was, with no upstream: not "on a remote branch".
    expect(texts(describeBranchChips({ found: true, pushed: true, unpushed: 0, base: 'main', baseAhead: 2, baseBehind: 0 }))).toEqual(['On a remote branch', '2 ahead, 0 behind main']);
    expect(texts(describeBranchChips({ found: true, pushed: true, unpushed: 0, base: 'main', baseAhead: 0, baseBehind: 1 }))).toEqual(['No commits yet · 1 behind main']);
    expect(texts(describeBranchChips({ found: true, base: 'main', baseAhead: 0, baseBehind: 0 }))).toEqual(['No commits yet']);
    expect(describeBranchChips({ found: false })).toEqual([]);
    expect(texts(describeBranchChips({ found: true }, { worktreePath: 'x', error: 'git status took over 45s' }))).toEqual(["Can't read changes"]);
  });

  test('the search finds words in the name, repo, note or newest commit; the repo filter keeps its repos', () => {
    const entry = { repo: 'acme/app', branch: 'spike/cache', note: 'Try Redis' };
    expect(trackedBranchMatches(entry, undefined)).toBe(true);
    expect(trackedBranchMatches(entry, undefined, { searchTerms: ['spike', 'redis'] })).toBe(true);
    expect(trackedBranchMatches(entry, { found: true, subject: 'Add LRU' }, { searchTerms: ['lru'] })).toBe(true);
    expect(trackedBranchMatches(entry, undefined, { searchTerms: ['memcached'] })).toBe(false);
    expect(trackedBranchMatches(entry, undefined, { repoNames: ['ACME/app'] })).toBe(true);
    expect(trackedBranchMatches(entry, undefined, { repoNames: ['acme/web'] })).toBe(false);
  });

  test('newest commit first, those not on this computer last', () => {
    const entries = [
      { repo: 'acme/app', branch: 'old' },
      { repo: 'acme/app', branch: 'away' },
      { repo: 'acme/app', branch: 'new' },
    ];
    const sorted = sortTrackedBranches(entries, {
      'acme/app:old': { found: true, committedAt: '2026-11-01T00:00:00.000Z' },
      'acme/app:new': { found: true, committedAt: '2026-11-17T00:00:00.000Z' },
    });
    expect(sorted.map((entry) => entry.branch)).toEqual(['new', 'old', 'away']);
  });

  test('commit ages read as words', () => {
    expect(formatCommitAge('now')).toBe('just now');
    expect(formatCommitAge('3d')).toBe('3d ago');
    expect(formatCommitAge('')).toBe('');
  });
});
