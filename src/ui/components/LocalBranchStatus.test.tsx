/** @jest-environment jsdom */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalBranchesProvider, describeLocalBranch, useLocalBranches } from '../state/LocalBranchesContext';
import { SnackbarContext, type SnackbarValue } from '../state/SnackbarContext';
import { PrLocalBranchChip, PrLocalBranchLine, describeCheckOut } from './LocalBranchStatus';

const PRS = {
  'acme/app#7': { branch: 'feature/x', oid: 'abcdef1234567', worktreePath: 'D:/work/x', ahead: 0, behind: 2, exact: true },
  'acme/app#8': { branch: 'feature/y', oid: '1234567abcdef', ahead: 0, behind: 0, exact: true },
};

let localBranches: Record<string, unknown>;
let localRepos: Record<string, unknown>;
let plans: Record<string, unknown>;
let openAnswer: { status: number; body: Record<string, unknown> };
let checkoutAnswer: { status: number; body: Record<string, unknown> };
const fetchMock = jest.fn(async (url: string, _init?: RequestInit) => {
  if (url === '/view-prs/open-in-editor') return { ok: openAnswer.status < 400, status: openAnswer.status, json: async () => openAnswer.body };
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
