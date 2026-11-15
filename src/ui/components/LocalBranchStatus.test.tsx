/** @jest-environment jsdom */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalBranchesProvider, describeLocalBranch, useLocalBranches } from '../state/LocalBranchesContext';
import { SnackbarContext, type SnackbarValue } from '../state/SnackbarContext';
import { renderHook } from '@testing-library/react';
import { PrLocalBranchChip, PrLocalBranchLine, canPull, describeCheckOut, useIsYourPr } from './LocalBranchStatus';

const PRS = {
  'acme/app#7': { branch: 'feature/x', oid: 'abcdef1234567', worktreePath: 'D:/work/x', ahead: 0, behind: 2, exact: true },
  'acme/app#8': { branch: 'feature/y', oid: '1234567abcdef', ahead: 0, behind: 0, exact: true },
};

let localBranches: Record<string, unknown>;
let localRepos: Record<string, unknown>;
let plans: Record<string, unknown>;
let openAnswer: { status: number; body: Record<string, unknown> };
let checkoutAnswer: { status: number; body: Record<string, unknown> };
let fetchAnswer: { status: number; body: Record<string, unknown> };
let pullAnswer: { status: number; body: Record<string, unknown> };
// Each PR's worktree's uncommitted changes, by its number.
let changesFor: Record<string, unknown>;
const fetchMock = jest.fn(async (url: string, _init?: RequestInit) => {
  if (url.startsWith('/view-prs/local-branches/changes?')) {
    const number = new URLSearchParams(url.split('?')[1]).get('number') || '';
    return { ok: true, status: 200, json: async () => ({ ok: true, changes: changesFor[number] ?? null }) };
  }
  if (url === '/view-prs/open-in-editor') return { ok: openAnswer.status < 400, status: openAnswer.status, json: async () => openAnswer.body };
  if (url === '/view-prs/local-branches/pull') {
    return { ok: pullAnswer.status < 400, status: pullAnswer.status, json: async () => pullAnswer.body };
  }
  if (url === '/view-prs/local-branches/fetch') {
    return { ok: fetchAnswer.status < 400, status: fetchAnswer.status, json: async () => fetchAnswer.body };
  }
  if (url === '/view-prs/local-branches/checkout') {
    return { ok: checkoutAnswer.status < 400, status: checkoutAnswer.status, json: async () => checkoutAnswer.body };
  }
  return { ok: true, status: 200, json: async () => ({ ok: true, repos: localRepos, prs: localBranches, plans }) };
});

beforeEach(() => {
  localBranches = PRS;
  plans = { 'acme/app#8': { how: 'git', fork: false }, 'acme/app#9': { how: 'git', fork: false } };
  localRepos = { 'acme/app': { path: 'D:/work/main', ok: true }, 'acme/broken': { path: 'D:/gone', ok: false, error: 'No such folder' } };
  openAnswer = { status: 200, body: { ok: true } };
  checkoutAnswer = { status: 200, body: { ok: true, branch: 'feature/z', worktreePath: 'D:/work/feature_z', how: 'git' } };
  fetchAnswer = { status: 200, body: { ok: true, remote: 'origin', ref: 'refs/heads/feature/e' } };
  changesFor = {};
  pullAnswer = { status: 200, body: { ok: true, branch: 'feature/x', from: 'a', to: 'b', commits: 2 } };
  showError.mockClear();
  showWarning.mockClear();
  fetchMock.mockClear();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

const showError = jest.fn();
const showWarning = jest.fn();
const renderWith = (ui: React.ReactNode) =>
  render(
    <SnackbarContext.Provider value={{ showError, showWarning } as unknown as SnackbarValue}>
      <LocalBranchesProvider>{ui}</LocalBranchesProvider>
    </SnackbarContext.Provider>,
  );

describe('a PR’s local branch', () => {
  test('describes ahead and behind: up to date, a count either way, an estimate, or differing', () => {
    const base = { branch: 'b', oid: 'o' };
    expect(describeLocalBranch({ ...base, ahead: 0, behind: 0 })).toBe('Up to date');
    expect(describeLocalBranch({ ...base, ahead: 0, behind: 2, exact: true })).toBe('2 behind');
    expect(describeLocalBranch({ ...base, ahead: 1, behind: 3, exact: true })).toBe('1 ahead, 3 behind');
    expect(describeLocalBranch({ ...base, ahead: 0, behind: 3, exact: false })).toBe('3+ behind');
    expect(describeLocalBranch({ ...base, diverged: true })).toBe('Differs from GitHub');
  });

  test("the row's chip says how far behind it is, with where it's checked out on hover; nothing without a local branch", async () => {
    renderWith(
      <>
        <PrLocalBranchChip repo="acme/app" prNumber="7" />
        <PrLocalBranchChip repo="acme/app" prNumber="9" />
      </>,
    );
    const chip = await screen.findByText(/Local · 2 behind/);
    expect(chip).toHaveAttribute('data-tone', 'attention');
    expect(chip.getAttribute('title')).toContain('Checked out in D:/work/x');
    expect(screen.getAllByText(/Local ·/)).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith('/view-prs/local-branches', expect.anything());
  });

  test("the pane's line opens the worktree in the editor; a branch not checked out has no button", async () => {
    const user = userEvent.setup();
    renderWith(
      <>
        <PrLocalBranchLine repo="acme/app" prNumber="7" />
        <PrLocalBranchLine repo="acme/app" prNumber="8" />
      </>,
    );
    expect(await screen.findByText('D:/work/x')).toBeInTheDocument();
    expect(screen.getByText(/· not checked out/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Open in editor' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Open in editor' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/view-prs/open-in-editor', expect.objectContaining({ method: 'POST' })),
    );
    const call = fetchMock.mock.calls.find(([url]) => url === '/view-prs/open-in-editor');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ repo: 'acme/app', path: 'D:/work/x' });
    expect(showError).not.toHaveBeenCalled();

    openAnswer = { status: 502, body: { ok: false, error: "The code command wasn't found" } };
    await user.click(screen.getByRole('button', { name: 'Open in editor' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith("Couldn't open the editor", "The code command wasn't found"));
  });

  test("an open PR not checked out has Check out: a worktree made, its folder shown with Open in editor, and the branches checked again", async () => {
    const user = userEvent.setup();
    renderWith(<PrLocalBranchLine repo="acme/app" prNumber="9" canCheckOut />);
    expect(await screen.findByText(/On this computer: not checked out/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check out' })).toHaveAttribute('title', "A worktree for the PR's branch, with git");
    const checks = () => fetchMock.mock.calls.filter(([url]) => url === '/view-prs/local-branches').length;
    const before = checks();
    await user.click(screen.getByRole('button', { name: 'Check out' }));
    expect(await screen.findByText('D:/work/feature_z')).toBeInTheDocument();
    expect(screen.getByText('feature/z')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check out' })).not.toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url === '/view-prs/local-branches/checkout');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ repo: 'acme/app', number: '9' });
    await waitFor(() => expect(checks()).toBeGreaterThan(before));

    await user.click(screen.getByRole('button', { name: 'Open in editor' }));
    const open = fetchMock.mock.calls.find(([url]) => url === '/view-prs/open-in-editor');
    expect(JSON.parse(String(open?.[1]?.body))).toEqual({ repo: 'acme/app', path: 'D:/work/feature_z' });
  });

  test('a local branch not checked out can be checked out too; not a merged or closed PR, nor one whose clone can\'t be read', async () => {
    renderWith(
      <>
        <PrLocalBranchLine repo="acme/app" prNumber="8" canCheckOut />
        <PrLocalBranchLine repo="acme/app" prNumber="10" />
        <PrLocalBranchLine repo="acme/broken" prNumber="1" canCheckOut />
      </>,
    );
    expect(await screen.findByText(/· not checked out/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Check out' })).toHaveLength(1);
    expect(screen.getAllByText(/On this computer/)).toHaveLength(1);
  });

  test("an open PR whose repo has no clone here (none saved, or unreadable) offers its checkout command to copy - once the clones are known", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    let answer: (value: Awaited<ReturnType<typeof fetchMock>>) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const user = userEvent.setup();
    // After setup, which puts in its own clipboard.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderWith(
      <>
        <PrLocalBranchLine repo="acme/other" prNumber="3" canCheckOut branch="feature/q" targetBranch="main" />
        <PrLocalBranchLine repo="acme/broken" prNumber="4" canCheckOut branch="b" crossRepository />
        <PrLocalBranchLine repo="acme/other" prNumber="5" branch="merged" />
        <PrLocalBranchLine repo="acme/app" prNumber="9" canCheckOut branch="feature/z" />
      </>,
    );
    // Not before the server says which repos have a clone.
    expect(screen.queryByText('Not on this computer')).not.toBeInTheDocument();
    await act(async () => answer({ ok: true, status: 200, json: async () => ({ ok: true, repos: localRepos, prs: localBranches, plans }) }));

    expect(await screen.findAllByText('Not on this computer')).toHaveLength(1);
    // A saved clone that can't be read says so, not that there's none.
    expect(screen.getByText(/the clone can't be read/)).toHaveAttribute('title', 'D:/gone: No such folder');
    expect(screen.getAllByRole('button', { name: 'Check out' })).toHaveLength(1);
    const [first, fork] = screen.getAllByRole('button', { name: 'Copy checkout command' }) as [HTMLElement, HTMLElement];
    // The shells it's for: && isn't Windows PowerShell 5.1's.
    expect(first).toHaveAttribute('title', expect.stringMatching(/^To paste into bash, zsh or Git Bash \(not Windows PowerShell 5\.1\).*origin/));
    await user.click(first);
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^git fetch origin refs\/heads\/feature\/q && git worktree add -b feature\/q \.\.\/other-feature_q FETCH_HEAD/));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    await user.click(fork);
    expect(writeText).toHaveBeenLastCalledWith(expect.stringMatching(/^git fetch origin refs\/pull\/4\/head && git worktree add -b pr-4 \.\.\/broken-pr-4 FETCH_HEAD/));
  });

  test('a page with no Clipboard API (opened from another computer over http) copies the older way; where nothing copies, the command is shown to select', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    let copied = '';
    const execCommand = jest.fn((name: string) => {
      copied = name === 'copy' ? (document.activeElement as HTMLTextAreaElement).value : '';
      return true;
    });
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    try {
      renderWith(<PrLocalBranchLine repo="acme/other" prNumber="3" canCheckOut branch="feature/q" />);
      const button = await screen.findByRole('button', { name: 'Copy checkout command' });
      await user.click(button);
      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(copied).toMatch(/^git fetch origin refs\/heads\/feature\/q && /);
      expect(await screen.findByRole('button', { name: 'Copied' })).toHaveFocus();
      expect(document.querySelector('textarea')).toBeNull();
      expect(screen.queryByLabelText('Checkout command')).not.toBeInTheDocument();

      execCommand.mockReturnValue(false);
      await user.click(screen.getByRole('button', { name: 'Copied' }));
      expect(await screen.findByRole('button', { name: 'Copy unavailable' })).toBeInTheDocument();
      const shown = screen.getByLabelText('Checkout command');
      expect(shown).toHaveTextContent(/^git fetch origin refs\/heads\/feature\/q && /);
      // One click selects it all, to copy by hand.
      await user.click(shown);
      expect(String(window.getSelection())).toBe(shown.textContent);
    } finally {
      delete (document as unknown as { execCommand?: unknown }).execCommand;
    }
  });

  test("an estimated or unknown count offers Fetch - the branches checked again after; not an exact one, nor a merged or closed PR's", async () => {
    localBranches = {
      ...PRS,
      'acme/app#11': { branch: 'feature/e', oid: 'e1', ahead: 0, behind: 3, exact: false },
      'acme/app#12': { branch: 'feature/d', oid: 'd1', diverged: true },
    };
    const user = userEvent.setup();
    renderWith(
      <>
        <PrLocalBranchLine repo="acme/app" prNumber="11" canCheckOut />
        <PrLocalBranchLine repo="acme/app" prNumber="12" canCheckOut />
        <PrLocalBranchLine repo="acme/app" prNumber="8" canCheckOut />
        <PrLocalBranchLine repo="acme/app" prNumber="7" />
      </>,
    );
    expect(await screen.findByText(/3\+ behind/)).toBeInTheDocument();
    const [estimated] = screen.getAllByRole('button', { name: 'Fetch' }) as [HTMLElement];
    expect(screen.getAllByRole('button', { name: 'Fetch' })).toHaveLength(2);
    expect(estimated).toHaveAttribute('title', expect.stringMatching(/no files or local branches change/));

    const checks = () => fetchMock.mock.calls.filter(([url]) => url === '/view-prs/local-branches').length;
    const before = checks();
    await user.click(estimated);
    const request = fetchMock.mock.calls.find(([url]) => url === '/view-prs/local-branches/fetch');
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ repo: 'acme/app', number: '11' });
    await waitFor(() => expect(checks()).toBe(before + 1));
    expect(showError).not.toHaveBeenCalled();
    expect(showWarning).not.toHaveBeenCalled();

    fetchAnswer = { status: 200, body: { ok: true, remote: 'origin', ref: 'r', warning: 'pushed over since' } };
    await user.click(screen.getAllByRole('button', { name: 'Fetch' })[0] as HTMLElement);
    await waitFor(() => expect(showWarning).toHaveBeenCalledWith('Fetched, but…', 'pushed over since'));

    fetchAnswer = { status: 502, body: { ok: false, error: "git fetch failed: couldn't find remote ref", output: 'fatal: no' } };
    await user.click(screen.getAllByRole('button', { name: 'Fetch' })[0] as HTMLElement);
    await waitFor(() => expect(showError).toHaveBeenCalledWith("Couldn't fetch the PR's branch", "git fetch failed: couldn't find remote ref\nfatal: no"));
  });

  test('a command just copied is not "Copied" for the next PR the pane shows', async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: jest.fn().mockResolvedValue(undefined) }, configurable: true });
    const providers = (ui: React.ReactNode) => (
      <SnackbarContext.Provider value={{ showError, showWarning } as unknown as SnackbarValue}>
        <LocalBranchesProvider>{ui}</LocalBranchesProvider>
      </SnackbarContext.Provider>
    );
    const { rerender } = render(providers(<PrLocalBranchLine repo="acme/other" prNumber="3" canCheckOut branch="feature/q" />));
    await user.click(await screen.findByRole('button', { name: 'Copy checkout command' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    rerender(providers(<PrLocalBranchLine repo="acme/other" prNumber="4" canCheckOut branch="feature/r" />));
    expect(screen.getByRole('button', { name: 'Copy checkout command' })).toBeInTheDocument();
  });

  test("Check out's title says what it will do, as the server's plan says: the repo's command, or git - for a local branch the clone has, as it is", async () => {
    localRepos = { 'acme/app': { path: 'D:/work/main', ok: true, checkout: { command: 'my-tool add {branch}', after: 'npm ci' } } };
    plans = { 'acme/app#8': { how: 'git', fork: false }, 'acme/app#9': { how: 'command', fork: false } };
    renderWith(
      <>
        <PrLocalBranchLine repo="acme/app" prNumber="9" canCheckOut />
        <PrLocalBranchLine repo="acme/app" prNumber="8" canCheckOut />
      </>,
    );
    const [noBranch, localBranch] = await screen.findAllByRole('button', { name: 'Check out' });
    expect(noBranch).toHaveAttribute('title', "A worktree for the PR's branch, with my-tool add {branch}");
    expect(localBranch?.getAttribute('title')).toMatch(/^A worktree for your branch .* as it is \(.*\), with git, then npm ci/);
  });

  test("describes Check out as the server will do it: by its plan, and for a local branch the clone has, as it is", () => {
    const command = 'my-tool add {branch}';
    const branch = { branch: 'mine', oid: 'o' };
    const byCommand = { how: 'command' as const, fork: false };
    const byGit = { how: 'git' as const, fork: false };
    expect(describeCheckOut({ info: null, plan: byCommand, command, after: 'npm ci', prNumber: '9' })).toBe("A worktree for the PR's branch, with my-tool add {branch}");
    expect(describeCheckOut({ info: null, plan: { how: 'git', fork: true }, command, after: 'npm ci', prNumber: '9' })).toBe(
      "A worktree for pr-9, the fork's PR, with git, then npm ci",
    );
    expect(describeCheckOut({ info: null, plan: byGit, command: undefined, after: undefined, prNumber: '9' })).toBe("A worktree for the PR's branch, with git");
    // No plan yet (the first check not back): git, as the server would without settings.
    expect(describeCheckOut({ info: null, plan: null, command: undefined, after: undefined, prNumber: '9' })).toBe("A worktree for the PR's branch, with git");
    // A local branch the clone has: git, as it is - saying so when GitHub has newer commits.
    expect(describeCheckOut({ info: { ...branch, ahead: 0, behind: 2, exact: true }, plan: byGit, command, after: 'npm ci', prNumber: '9' })).toBe(
      "A worktree for your branch mine as it is (2 behind), with git, then npm ci - the PR's newer commits aren't fetched",
    );
    expect(describeCheckOut({ info: { ...branch, ahead: 0, behind: 0 }, plan: byGit, command: undefined, after: undefined, prNumber: '9' })).toBe(
      'A worktree for your branch mine as it is (up to date), with git',
    );
    expect(describeCheckOut({ info: { ...branch, diverged: true }, plan: byGit, command: undefined, after: undefined, prNumber: '9' })).toBe(
      "A worktree for your branch mine as it is (differs from GitHub), with git - the PR's newer commits aren't fetched",
    );
    expect(describeCheckOut({ info: { ...branch, ahead: 0, behind: 0, nameOnly: true }, plan: byGit, command: undefined, after: undefined, prNumber: '9' })).toBe(
      "A worktree for your branch mine as it is (up to date, same name only - it doesn't track the PR's branch), with git",
    );
    // Your own PR: what isn't pushed, as the pane's line says it.
    const unpushed = { ...branch, ahead: 1, behind: 0, exact: true, unpushed: 1 };
    expect(describeCheckOut({ info: unpushed, plan: byGit, command: undefined, after: undefined, prNumber: '9', mine: true })).toBe(
      'A worktree for your branch mine as it is (1 not pushed), with git',
    );
    expect(describeCheckOut({ info: unpushed, plan: byGit, command: undefined, after: undefined, prNumber: '9' })).toBe(
      'A worktree for your branch mine as it is (1 ahead), with git',
    );
  });

  test("your own PR says what isn't pushed in place of ahead; anyone else's says ahead, as before", () => {
    const base = { branch: 'b', oid: 'o', exact: true };
    expect(describeLocalBranch({ ...base, ahead: 2, behind: 1, unpushed: 2 }, { mine: true })).toBe('2 not pushed, 1 behind');
    expect(describeLocalBranch({ ...base, ahead: 2, behind: 1, unpushed: 2 })).toBe('2 ahead, 1 behind');
    // Pushed, but the dashboard's copy of the PR is older: ahead of it still.
    expect(describeLocalBranch({ ...base, ahead: 2, behind: 0, unpushed: 0 }, { mine: true })).toBe('2 ahead');
    expect(describeLocalBranch({ branch: 'b', oid: 'o', diverged: true, unpushed: 3 }, { mine: true })).toBe('Differs from GitHub, 3 not pushed');
    expect(describeLocalBranch({ branch: 'b', oid: 'o', diverged: true }, { mine: true })).toBe('Differs from GitHub');
  });

  test("your own PR's commits not pushed are in the attention colour, in the chip and the pane, with why on hover", async () => {
    localBranches = {
      'acme/app#7': { ...PRS['acme/app#7'], ahead: 1, behind: 0, unpushed: 1 },
      'acme/app#8': { ...PRS['acme/app#8'], ahead: 2, behind: 0, unpushed: 0 },
    };
    renderWith(
      <>
        <PrLocalBranchChip repo="acme/app" prNumber="7" mine />
        <PrLocalBranchChip repo="acme/app" prNumber="8" mine />
        <PrLocalBranchLine repo="acme/app" prNumber="7" mine />
      </>,
    );
    const chip = await screen.findByText(/Local · 1 not pushed/);
    expect(chip).toHaveAttribute('data-tone', 'attention');
    expect(chip.getAttribute('title')).toContain("1 commit here GitHub doesn't have - on neither the PR nor the clone's copy of the remote branch: push to share it.");
    // Pushed already: not in the attention colour, and the hover says so.
    const pushed = screen.getByText(/Local · 2 ahead/);
    expect(pushed).not.toHaveAttribute('data-tone');
    expect(pushed.getAttribute('title')).toContain("Its commits past the PR's are pushed");
    const line = screen.getByText(/On this computer:/).closest('p');
    expect(line).toHaveTextContent('1 not pushed');
    expect(line).toHaveAttribute('data-tone', 'attention');
  });

  test("someone else's PR's local commits are ahead, not in the attention colour", async () => {
    localBranches = { 'acme/app#7': { ...PRS['acme/app#7'], ahead: 1, behind: 0, unpushed: 1 } };
    renderWith(<PrLocalBranchChip repo="acme/app" prNumber="7" />);
    const chip = await screen.findByText(/Local · 1 ahead/);
    expect(chip).not.toHaveAttribute('data-tone');
    expect(chip.getAttribute('title')).not.toContain('push');
  });

  test("a PR is yours when its author is you, whatever the case; not when it's someone else's or you aren't known", () => {
    const yours = (pr: Record<string, unknown>) => renderHook(() => useIsYourPr(pr)).result.current;
    expect(yours({ authorLogin: 'Alice', viewerLogin: 'alice' })).toBe(true);
    expect(yours({ authorLogin: 'bob', viewerLogin: 'alice' })).toBe(false);
    expect(yours({ authorLogin: 'alice' })).toBe(false);
    expect(yours({ viewerLogin: 'alice' })).toBe(false);
  });

  test("a branch found by the PR's branch's name alone is marked so, in the chip and the pane, not in the attention colour", async () => {
    localBranches = { 'acme/app#7': { branch: 'feature/x', oid: 'abcdef1234567', worktreePath: 'D:/work/x', ahead: 0, behind: 2, exact: true, nameOnly: true } };
    renderWith(
      <>
        <PrLocalBranchChip repo="acme/app" prNumber="7" />
        <PrLocalBranchLine repo="acme/app" prNumber="7" />
      </>,
    );
    const chip = await screen.findByText(/Local · 2 behind · same name only/);
    expect(chip).toHaveAttribute('data-name-only', 'true');
    expect(chip).not.toHaveAttribute('data-tone');
    expect(chip.getAttribute('title')).toContain('tracks no remote branch, so it may not be the PR');
    expect(screen.getByText("(same name, not tracking the PR's branch)")).toBeInTheDocument();
  });

  test('a slow checkout shows how long it has taken; what a failed one printed is kept under the line', async () => {
    jest.useFakeTimers();
    try {
      let answer: (value: unknown) => void = () => {};
      fetchMock.mockImplementationOnce(async (url: string) => {
        if (url !== '/view-prs/local-branches') throw new Error(`unexpected ${url}`);
        return { ok: true, status: 200, json: async () => ({ ok: true, repos: localRepos, prs: localBranches, plans }) };
      });
      renderWith(<PrLocalBranchLine repo="acme/app" prNumber="9" canCheckOut />);
      const button = await screen.findByRole('button', { name: 'Check out' });
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }) as never,
      );
      act(() => button.click());
      expect(await screen.findByRole('button', { name: 'Checking out…' })).toBeDisabled();
      act(() => jest.advanceTimersByTime(5000));
      expect(screen.getByRole('button', { name: 'Checking out… 5s' })).toBeInTheDocument();
      await act(async () =>
        answer({
          ok: false,
          status: 502,
          json: async () => ({ ok: false, error: 'The checkout command failed: nope', output: 'step 1\nstep 2\nerror: nope' }),
        }),
      );
      expect(await screen.findByRole('button', { name: 'Check out' })).toBeEnabled();
      expect(screen.getByText('What the checkout printed')).toBeInTheDocument();
      expect(screen.getByText(/step 1\s+step 2\s+error: nope/)).toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  test("a checkout that fails says why, with the end of what it printed; one made with a warning says so", async () => {
    checkoutAnswer = {
      status: 502,
      body: { ok: false, error: 'The checkout command failed: no such branch', output: 'line 1\nline 2\nline 3\nerror: no such branch' },
    };
    const user = userEvent.setup();
    renderWith(<PrLocalBranchLine repo="acme/app" prNumber="9" canCheckOut />);
    await user.click(await screen.findByRole('button', { name: 'Check out' }));
    await waitFor(() =>
      expect(showError).toHaveBeenCalledWith("Couldn't check it out", 'The checkout command failed: no such branch\nline 2\nline 3\nerror: no such branch'),
    );
    expect(screen.getByRole('button', { name: 'Check out' })).toBeEnabled();

    checkoutAnswer = { status: 200, body: { ok: true, branch: 'pr-9', worktreePath: 'D:/work/pr-9', warning: 'The after-command failed: oops' } };
    await user.click(screen.getByRole('button', { name: 'Check out' }));
    await waitFor(() => expect(showWarning).toHaveBeenCalledWith('Checked out, but…', 'The after-command failed: oops'));
    expect(screen.getByText('D:/work/pr-9')).toBeInTheDocument();
  });

  test("a worktree's uncommitted changes are under the pane's line, each file on hover; nothing when clean or not checked out", async () => {
    changesFor = {
      7: {
        worktreePath: 'D:/work/x',
        staged: 1,
        changed: 2,
        untracked: 1,
        conflicted: 0,
        total: 4,
        files: [
          { path: 'a.ts', code: 'MM' },
          { path: 'b.ts', code: ' M' },
          { path: 'new/', code: '??' },
        ],
      },
    };
    const { rerender } = renderWith(
      <>
        <PrLocalBranchLine repo="acme/app" prNumber="7" />
        <PrLocalBranchLine repo="acme/app" prNumber="8" />
      </>,
    );
    const line = await screen.findByText(/Uncommitted: 1 staged, 2 changed, 1 new/);
    expect(line.getAttribute('title')).toBe(['Not committed in D:/work/x:', 'MM a.ts', ' M b.ts', '?? new/', '…and 1 more'].join('\n'));
    expect(line.closest('p')).not.toHaveAttribute('data-tone');
    const asked = () => fetchMock.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/view-prs/local-branches/changes?'));
    // Only the PR checked out in a worktree is asked about.
    expect(asked()).toEqual(['/view-prs/local-branches/changes?repo=acme%2Fapp&number=7']);

    // Back from the editor, committed: the line goes.
    changesFor = { 7: { worktreePath: 'D:/work/x', staged: 0, changed: 0, untracked: 0, conflicted: 0, total: 0, files: [] } };
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(screen.queryByText(/Uncommitted/)).not.toBeInTheDocument());
    expect(asked().length).toBeGreaterThan(1);

    // A merge stopped part way: conflicts, in the attention colour.
    changesFor = { 7: { worktreePath: 'D:/work/x', staged: 0, changed: 0, untracked: 0, conflicted: 2, total: 2, files: [] } };
    window.dispatchEvent(new Event('focus'));
    expect((await screen.findByText(/Uncommitted: 2 conflicted/)).closest('p')).toHaveAttribute('data-tone', 'attention');

    // Its folder deleted: can't be read, with why on hover.
    changesFor = { 7: { worktreePath: 'D:/work/x', error: 'Its folder is gone' } };
    window.dispatchEvent(new Event('focus'));
    expect(await screen.findByText(/The worktree can't be read/)).toHaveAttribute('title', 'D:/work/x: Its folder is gone');
    rerender(
      <SnackbarContext.Provider value={{ showError, showWarning } as unknown as SnackbarValue}>
        <LocalBranchesProvider>
          <PrLocalBranchLine repo="acme/app" prNumber="8" />
        </LocalBranchesProvider>
      </SnackbarContext.Provider>,
    );
    expect(screen.queryByText(/The worktree can't be read/)).not.toBeInTheDocument();
  });

  test('a worktree mid-rebase says so in the pane, and how to finish on hover', async () => {
    localBranches = { 'acme/app#7': { ...PRS['acme/app#7'], rebasing: true } };
    renderWith(<PrLocalBranchLine repo="acme/app" prNumber="7" canCheckOut />);
    const text = await screen.findByText(/· rebase in progress/);
    expect(text.closest('[title]')?.getAttribute('title')).toContain('a rebase in progress there (git rebase --continue or --abort)');
    expect(screen.queryByRole('button', { name: 'Check out' })).not.toBeInTheDocument();
  });

  test("the pane moved on to another PR shows nothing of the last one's changes, even when its answer comes late", async () => {
    localBranches = { ...PRS, 'acme/app#11': { branch: 'feature/w', oid: '99999997654321', worktreePath: 'D:/work/w', ahead: 0, behind: 0, exact: true } };
    let answerLate: () => void = () => {};
    const shown = { worktreePath: 'D:/work/x', staged: 0, changed: 1, untracked: 0, conflicted: 0, total: 1, files: [{ path: 'x.ts', code: ' M' }] };
    changesFor = { 7: shown };
    const realFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/changes?') && url.endsWith('number=7')) await new Promise<void>((resolve) => (answerLate = resolve));
      return realFetch(url, init);
    });
    try {
      const pane = (number: string) => (
        <SnackbarContext.Provider value={{ showError, showWarning } as unknown as SnackbarValue}>
          <LocalBranchesProvider>
            <PrLocalBranchLine key="pane" repo="acme/app" prNumber={number} />
          </LocalBranchesProvider>
        </SnackbarContext.Provider>
      );
      const { rerender } = render(pane('7'));
      expect(await screen.findByText('D:/work/x')).toBeInTheDocument();
      rerender(pane('11'));
      expect(await screen.findByText('D:/work/w')).toBeInTheDocument();
      await act(async () => answerLate());
      expect(screen.queryByText(/Uncommitted/)).not.toBeInTheDocument();
    } finally {
      fetchMock.mockImplementation(realFetch);
    }
  });

  test('Pull only when behind with nothing ahead, tracking the PR\'s branch, no rebase - and, checked out, no uncommitted changes known', () => {
    const base = { branch: 'b', oid: 'o', ahead: 0, behind: 2, exact: true };
    const clean = { worktreePath: 'D:/w', staged: 0, changed: 0, untracked: 3, conflicted: 0, total: 3, files: [] };
    expect(canPull(base, undefined)).toBe(true);
    expect(canPull({ ...base, exact: false }, undefined)).toBe(true);
    expect(canPull({ ...base, worktreePath: 'D:/w' }, clean)).toBe(true);
    // Its changes not known yet, or some staged, changed or conflicted.
    expect(canPull({ ...base, worktreePath: 'D:/w' }, null)).toBe(false);
    expect(canPull({ ...base, worktreePath: 'D:/w' }, { ...clean, changed: 1 })).toBe(false);
    expect(canPull({ ...base, worktreePath: 'D:/w' }, { ...clean, staged: 1 })).toBe(false);
    expect(canPull({ ...base, worktreePath: 'D:/w' }, { ...clean, conflicted: 1 })).toBe(false);
    expect(canPull({ ...base, worktreePath: 'D:/w' }, { worktreePath: 'D:/w', error: 'gone' })).toBe(false);
    for (const info of [
      { ...base, ahead: 1 },
      { ...base, behind: 0 },
      { ...base, diverged: true },
      { ...base, nameOnly: true },
      { ...base, rebasing: true },
    ]) {
      expect(canPull(info, undefined)).toBe(false);
    }
    expect(canPull(null, undefined)).toBe(false);
  });

  test('Pull asks first, then fast-forwards and checks again; says why when it can\'t; not offered with uncommitted changes', async () => {
    changesFor = { 7: { worktreePath: 'D:/work/x', staged: 0, changed: 0, untracked: 0, conflicted: 0, total: 0, files: [] } };
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      const user = userEvent.setup();
      renderWith(<PrLocalBranchLine repo="acme/app" prNumber="7" canCheckOut />);
      const button = await screen.findByRole('button', { name: 'Pull' });
      const pulls = () => fetchMock.mock.calls.filter(([url]) => url === '/view-prs/local-branches/pull');
      await user.click(button);
      expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/^Pull 2 commits into feature\/x in D:\/work\/x\?\n\nFast-forward only/));
      expect(pulls()).toHaveLength(0);

      confirm.mockReturnValue(true);
      const checks = () => fetchMock.mock.calls.filter(([url]) => url === '/view-prs/local-branches').length;
      const before = checks();
      await user.click(button);
      await waitFor(() => expect(pulls()).toHaveLength(1));
      expect(JSON.parse(String(pulls()[0]?.[1]?.body))).toEqual({ repo: 'acme/app', number: '7' });
      await waitFor(() => expect(checks()).toBeGreaterThan(before));

      pullAnswer = { status: 409, body: { ok: false, error: 'Uncommitted changes in D:/work/x - commit or stash them first' } };
      await user.click(screen.getByRole('button', { name: 'Pull' }));
      await waitFor(() => expect(showError).toHaveBeenCalledWith("Couldn't pull", 'Uncommitted changes in D:/work/x - commit or stash them first'));

      // A change made since: no Pull.
      changesFor = { 7: { worktreePath: 'D:/work/x', staged: 0, changed: 1, untracked: 0, conflicted: 0, total: 1, files: [] } };
      window.dispatchEvent(new Event('focus'));
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Pull' })).not.toBeInTheDocument());
    } finally {
      confirm.mockRestore();
    }
  });

  test('a merged or closed PR has no Pull', async () => {
    renderWith(<PrLocalBranchLine repo="acme/app" prNumber="7" />);
    expect(await screen.findByText('D:/work/x')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pull' })).not.toBeInTheDocument();
  });

  test('a check asked for while one is running (a clone just saved) runs once that one is done', async () => {
    let finishFirst: () => void = () => {};
    // The first check waits; the next is answered as usual.
    fetchMock.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => (finishFirst = resolve));
      return { ok: true, status: 200, json: async () => ({ ok: true, repos: {}, prs: {} }) };
    });
    const calls = () => fetchMock.mock.calls.filter(([url]) => url === '/view-prs/local-branches').length;
    function Refresh() {
      const { refresh } = useLocalBranches();
      return (
        <button type="button" onClick={refresh}>
          Check
        </button>
      );
    }
    const user = userEvent.setup();
    renderWith(
      <>
        <Refresh />
        <PrLocalBranchChip repo="acme/app" prNumber="8" />
      </>,
    );
    await waitFor(() => expect(calls()).toBe(1));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    finishFirst();
    expect(await screen.findByText('Local · Up to date')).toBeInTheDocument();
    expect(calls()).toBe(2);
  });

  test('checks every minute while the page is shown, not while it is hidden', async () => {
    jest.useFakeTimers();
    const visibility = jest.spyOn(document, 'visibilityState', 'get');
    try {
      visibility.mockReturnValue('hidden');
      renderWith(<PrLocalBranchChip repo="acme/app" prNumber="8" />);
      const calls = () => fetchMock.mock.calls.filter(([url]) => url === '/view-prs/local-branches').length;
      await waitFor(() => expect(calls()).toBe(1));
      await act(async () => {
        jest.advanceTimersByTime(3 * 60 * 1000);
      });
      expect(calls()).toBe(1);
      visibility.mockReturnValue('visible');
      await act(async () => {
        jest.advanceTimersByTime(60 * 1000);
      });
      expect(calls()).toBe(2);
    } finally {
      visibility.mockRestore();
      jest.useRealTimers();
    }
  });

  test('checks again when the window is focused (back from the editor)', async () => {
    renderWith(<PrLocalBranchChip repo="acme/app" prNumber="8" />);
    expect(await screen.findByText('Local · Up to date')).toBeInTheDocument();
    localBranches = { 'acme/app#8': { ...PRS['acme/app#8'], ahead: 2 } };
    window.dispatchEvent(new Event('focus'));
    expect(await screen.findByText('Local · 2 ahead')).toBeInTheDocument();
  });
});
