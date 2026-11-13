/** @jest-environment jsdom */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalBranchesProvider, describeLocalBranch, useLocalBranches } from '../state/LocalBranchesContext';
import { SnackbarContext, type SnackbarValue } from '../state/SnackbarContext';
import { PrLocalBranchChip, PrLocalBranchLine } from './LocalBranchStatus';

const PRS = {
  'acme/app#7': { branch: 'feature/x', oid: 'abcdef1234567', worktreePath: 'D:/work/x', ahead: 0, behind: 2, exact: true },
  'acme/app#8': { branch: 'feature/y', oid: '1234567abcdef', ahead: 0, behind: 0, exact: true },
};

let localBranches: Record<string, unknown>;
let openAnswer: { status: number; body: Record<string, unknown> };
const fetchMock = jest.fn(async (url: string, _init?: RequestInit) => {
  if (url === '/view-prs/open-in-editor') return { ok: openAnswer.status < 400, status: openAnswer.status, json: async () => openAnswer.body };
  return { ok: true, status: 200, json: async () => ({ ok: true, repos: {}, prs: localBranches }) };
});

beforeEach(() => {
  localBranches = PRS;
  openAnswer = { status: 200, body: { ok: true } };
  fetchMock.mockClear();
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});

const showError = jest.fn();
const renderWith = (ui: React.ReactNode) =>
  render(
    <SnackbarContext.Provider value={{ showError } as unknown as SnackbarValue}>
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
