import { checkoutCommandFor, isForkPr, shellQuote } from './checkout-command.helpers';

describe('the copied checkout command', () => {
  test("fetches the PR's branch from origin into a worktree beside the clone named after the repo, tracking it - set by git config, so a shallow or single-branch clone (no origin/<branch>) works too", () => {
    expect(checkoutCommandFor({ repo: 'acme/app', number: 7, branch: 'feature/x', targetBranch: 'main' })).toBe(
      'git fetch origin refs/heads/feature/x && git worktree add -b feature/x ../app-feature_x FETCH_HEAD && git config branch.feature/x.remote origin && git config branch.feature/x.merge refs/heads/feature/x',
    );
  });

  test("a fork's PR: its pull ref into pr-<number>, tracking it as gh pr checkout does - also one whose branch has the base's name", () => {
    const expected =
      'git fetch origin refs/pull/12/head && git worktree add -b pr-12 ../app-pr-12 FETCH_HEAD && git config branch.pr-12.remote origin && git config branch.pr-12.merge refs/pull/12/head';
    expect(checkoutCommandFor({ repo: 'acme/app', number: 12, branch: '', crossRepository: true })).toBe(expected);
    expect(checkoutCommandFor({ repo: 'acme/app', number: 12, branch: 'main', targetBranch: 'main' })).toBe(expected);
  });

  test('a branch name the shell would read otherwise is quoted; none without a known branch', () => {
    expect(checkoutCommandFor({ repo: 'acme/app', number: 7, branch: "it's$x" })).toBe(
      `git fetch origin 'refs/heads/it'\\''s$x' && git worktree add -b 'it'\\''s$x' '../app-it'\\''s$x' FETCH_HEAD && git config 'branch.it'\\''s$x.remote' origin && git config 'branch.it'\\''s$x.merge' 'refs/heads/it'\\''s$x'`,
    );
    expect(checkoutCommandFor({ repo: 'acme/app', number: 7 })).toBe('');
    expect(shellQuote('a;b')).toBe("'a;b'");
    expect(shellQuote('v1.2/x-y_z')).toBe('v1.2/x-y_z');
    // zsh takes a word starting with = for a command's path.
    expect(shellQuote('=fix')).toBe("'=fix'");
    expect(shellQuote('a=b')).toBe('a=b');
  });

  test("the fork rule is the server's", () => {
    expect(isForkPr({ branch: 'x', targetBranch: 'main' })).toBe(false);
    expect(isForkPr({ branch: 'main', targetBranch: 'main' })).toBe(true);
    expect(isForkPr({ crossRepository: true })).toBe(true);
    expect(isForkPr({ branch: 'x' })).toBe(false);
  });
});
