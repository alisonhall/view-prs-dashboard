/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EMPTY_LOCAL_BRANCHES, LocalBranchesContext, type LocalBranchesValue } from '../../state/LocalBranchesContext';
import { SnackbarContext, type SnackbarValue } from '../../state/SnackbarContext';
import { BranchDetailPane } from './BranchDetailPane';
import { TrackedBranchesSection } from '../TrackedBranchesSection';
import { SearchTermsContext } from '../../state/SearchTermsContext';

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();
let commitsAnswer: { status: number; body: Record<string, unknown> };
const asked: string[] = [];
let changes: Record<string, unknown> = {};
const posted: Array<{ url: string; body: unknown }> = [];
const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
  asked.push(url);
  if (init?.method === 'POST') {
    posted.push({ url, body: JSON.parse(String(init.body || '{}')) });
    if (url.endsWith('/tracked-branches/fetch')) return { ok: true, status: 200, json: async () => ({ ok: true, ahead: 0, behind: 2 }) };
    if (url.endsWith('/tracked-branches/pull')) return { ok: true, status: 200, json: async () => ({ ok: true, commits: 2 }) };
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  }
  if (url.startsWith('/view-prs/tracked-branches/commits?')) {
    return { ok: commitsAnswer.status < 400, status: commitsAnswer.status, json: async () => commitsAnswer.body };
  }
  if (url.startsWith('/view-prs/tracked-branches/commit-files?')) {
    return { ok: true, status: 200, json: async () => ({ ok: true, files: [{ path: 'src/cache.ts', added: 12, removed: 3 }, { path: 'b.ts', oldPath: 'a.ts', added: 0, removed: 0 }, { path: 'logo.png', added: 0, removed: 0, binary: true }] }) };
  }
  if (url === '/view-prs/tracked-branches/changes') return { ok: true, status: 200, json: async () => ({ ok: true, changes }) };
  return { ok: false, status: 404, json: async () => ({ ok: false }) };
});

const STATUS = {
  found: true,
  branch: 'spike/cache',
  oid: 'c2',
  committedAt: hoursAgo(2),
  subject: 'Cache the lookups',
  worktreePath: 'D:/code/app-spike',
  pushed: false,
  unpushed: 1,
  base: 'main',
  baseAhead: 2,
  baseBehind: 3,
};
const local = (overrides: Partial<LocalBranchesValue> = {}): LocalBranchesValue => ({
  ...EMPTY_LOCAL_BRANCHES,
  loaded: true,
  refresh: jest.fn(),
  repos: { 'acme/app': { path: 'D:/code/app', ok: true } },
  branches: { 'acme/app:spike/cache': STATUS },
  ...overrides,
});
const wrap = (ui: React.ReactNode, value: LocalBranchesValue = local()) => (
  <SnackbarContext.Provider value={{ showError: jest.fn(), showWarning: jest.fn() } as unknown as SnackbarValue}>
    <LocalBranchesContext.Provider value={value}>
      <SearchTermsContext.Provider value={[]}>{ui}</SearchTermsContext.Provider>
    </LocalBranchesContext.Provider>
  </SnackbarContext.Provider>
);
const ENTRY = { repo: 'acme/app', branch: 'spike/cache', note: 'Try Redis' };

describe('BranchDetailPane', () => {
  beforeEach(() => {
    asked.length = 0;
    posted.length = 0;
    changes = {};
    fetchMock.mockClear();
    commitsAnswer = {
      status: 200,
      body: {
        ok: true,
        branch: 'spike/cache',
        base: 'main',
        behind: 3,
        more: false,
        commits: [
          { oid: 'c2c2c2c2c2', parents: ['c1c1c1c1c1'], author: 'Ada', committedAt: hoursAgo(2), subject: 'Cache the lookups', pushed: false },
          { oid: 'c1c1c1c1c1', parents: ['b0'], author: 'Ada', committedAt: hoursAgo(26), subject: 'Add a cache', pushed: true },
        ],
      },
    };
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  test('the branch, how it stands, its note, and its commits since it left its base - those not on GitHub marked', async () => {
    render(wrap(<BranchDetailPane entry={ENTRY} mode="docked" onClose={jest.fn()} />));
    const pane = screen.getByRole('complementary', { name: 'Branch spike/cache' });
    expect(pane).toHaveTextContent('acme/app');
    expect(pane).toHaveTextContent('based on main');
    expect(pane).toHaveTextContent('2 ahead, 3 behind main');
    expect(pane).toHaveTextContent('Try Redis');
    expect(within(pane).getByRole('button', { name: 'Open in editor' })).toBeInTheDocument();
    const list = await within(pane).findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Cache the lookups');
    expect(items[0]).toHaveTextContent('not pushed');
    expect(items[0]).toHaveTextContent('c2c2c2c');
    expect(items[0]).toHaveTextContent('2h ago');
    // A pushed one links to it on GitHub; one not pushed can't.
    expect(within(items[1] as HTMLElement).getByRole('link')).toHaveAttribute('href', 'https://github.com/acme/app/commit/c1c1c1c1c1');
    expect(within(items[0] as HTMLElement).queryByRole('link')).not.toBeInTheDocument();
    expect(items[1]).not.toHaveTextContent('not pushed');
    expect(screen.getByRole('heading', { name: /Commits since it left main/ })).toHaveTextContent('2');
    expect(pane).toHaveTextContent('main has 3 commits since, not on spike/cache.');
    expect(asked).toContain('/view-prs/tracked-branches/commits?repo=acme%2Fapp&branch=spike%2Fcache');
  });

  test('a main branch lists its newest commits; none of its own, a failure with Try again, and no clone each say so', async () => {
    const user = userEvent.setup();
    commitsAnswer = { status: 200, body: { ok: true, branch: 'spike/cache', base: 'spike/cache', recent: true, more: true, commits: [{ oid: 'aaaaaaa1', parents: [], author: 'Bo', committedAt: hoursAgo(1), subject: 'Release', pushed: true }] } };
    const { unmount } = render(wrap(<BranchDetailPane entry={ENTRY} mode="docked" onClose={jest.fn()} />));
    expect(await screen.findByRole('heading', { name: /Newest commits/ })).toHaveTextContent('1+');
    expect(screen.getByText("Older commits aren't listed.")).toBeInTheDocument();
    unmount();

    commitsAnswer = { status: 200, body: { ok: true, base: 'main', commits: [], behind: 0 } };
    const second = render(wrap(<BranchDetailPane entry={ENTRY} mode="docked" onClose={jest.fn()} />));
    expect(await screen.findByText(/No commits of its own yet/)).toBeInTheDocument();
    second.unmount();

    commitsAnswer = { status: 422, body: { ok: false, error: 'git broke' } };
    const third = render(wrap(<BranchDetailPane entry={ENTRY} mode="docked" onClose={jest.fn()} />));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't list its commits: git broke.");
    commitsAnswer = { status: 200, body: { ok: true, base: 'main', commits: [] } };
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/No commits of its own yet/)).toBeInTheDocument();
    third.unmount();

    asked.length = 0;
    render(wrap(<BranchDetailPane entry={{ repo: 'other/lib', branch: 'x' }} mode="docked" onClose={jest.fn()} />));
    expect(screen.getByText(/No clone of other\/lib here/)).toBeInTheDocument();
    expect(asked).toEqual([]);
  });

  test('a commit opens to the files it changed: lines added and removed, a rename, a binary file', async () => {
    const user = userEvent.setup();
    render(wrap(<BranchDetailPane entry={ENTRY} mode="docked" onClose={jest.fn()} />));
    const toggle = await screen.findByRole('button', { name: 'Cache the lookups' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const files = await screen.findByRole('list', { name: 'Files changed in c2c2c2c' });
    const items = within(files).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('src/cache.ts+12 −3');
    expect(items[1]).toHaveTextContent('a.ts → b.ts');
    expect(items[2]).toHaveTextContent('logo.pngbinary');
    expect(asked).toContain('/view-prs/tracked-branches/commit-files?repo=acme%2Fapp&oid=c2c2c2c2c2');
    // Closed and opened again: not asked twice.
    await user.click(toggle);
    await user.click(toggle);
    expect(asked.filter((url) => url.includes('commit-files'))).toHaveLength(1);
  });

  test("its uncommitted files, and Fetch, Pull and New branch as on its row", async () => {
    const user = userEvent.setup();
    changes = {
      'acme/app:spike/cache': {
        worktreePath: 'D:/code/app-spike',
        total: 3,
        files: [
          { path: 'a.ts', code: ' M' },
          { path: 'b.ts', code: 'M ' },
          { path: 'new.ts', code: '??' },
        ],
      },
    };
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const statuses = { 'acme/app:spike/cache': { ...STATUS, upstream: { remote: 'origin', branch: 'spike/cache', ahead: 0, behind: 2 } } };
    render(wrap(<BranchDetailPane entry={ENTRY} mode="docked" onClose={jest.fn()} />, local({ branches: statuses })));
    const heading = await screen.findByRole('heading', { name: /Uncommitted changes/ });
    const list = heading.parentElement?.querySelector('ul') as HTMLElement;
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['a.tschanged', 'b.tsstaged', 'new.tsnew']);
    expect(screen.getByRole('complementary')).toHaveTextContent('3 uncommitted');

    await user.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(await screen.findByText('Fetched origin/spike/cache: spike/cache is 2 commits behind it - Pull brings them in.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pull' }));
    expect(await screen.findByText('Pulled 2 commits into spike/cache.')).toBeInTheDocument();
    expect(posted.map((item) => item.url)).toEqual(['/view-prs/tracked-branches/fetch', '/view-prs/tracked-branches/pull']);
    await user.click(screen.getByRole('button', { name: 'New branch' }));
    expect(screen.getByRole('form', { name: 'New branch from spike/cache' })).toBeInTheDocument();
    confirm.mockRestore();
  });

  test('close, and Esc in the docked pane clears it', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const onClearSelection = jest.fn();
    render(wrap(<BranchDetailPane entry={ENTRY} mode="docked" onClose={onClose} onClearSelection={onClearSelection} />));
    await screen.findByRole('list');
    fireEvent.keyDown(screen.getByRole('list'), { key: 'Escape' });
    expect(onClearSelection).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Close details' }));
    expect(onClose).toHaveBeenCalled();
  });

  test("a tracked row's name shows it in the pane, marked while it's there", async () => {
    const user = userEvent.setup();
    const onSelectBranch = jest.fn();
    const onShownChange = jest.fn();
    const { rerender } = render(
      wrap(<TrackedBranchesSection trackedBranches={[ENTRY]} isOpen onToggleSection={jest.fn()} onSelectBranch={onSelectBranch} onShownChange={onShownChange} />),
    );
    // The rows shown, for the pane's previous and next.
    expect(onShownChange).toHaveBeenLastCalledWith(['acme/app:spike/cache']);
    await user.click(screen.getByRole('button', { name: 'spike/cache' }));
    expect(onSelectBranch).toHaveBeenCalledWith('acme/app', 'spike/cache');
    // Anywhere on the row, as a PR row - but not its buttons.
    onSelectBranch.mockClear();
    const row = document.querySelector('tr.tracked-branch-row') as HTMLElement;
    await user.click(within(row).getByText('acme/app'));
    expect(onSelectBranch).toHaveBeenCalledTimes(1);
    await user.click(within(row).getByText('app-spike'));
    expect(onSelectBranch).toHaveBeenCalledTimes(2);
    await user.click(within(row).getByRole('button', { name: 'Note: Try Redis' }));
    expect(onSelectBranch).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('textbox', { name: 'Note on spike/cache' })).toBeInTheDocument();
    rerender(
      wrap(
        <TrackedBranchesSection
          trackedBranches={[ENTRY]}
          isOpen
          onToggleSection={jest.fn()}
          onSelectBranch={onSelectBranch}
          selectedBranchKey="acme/app:spike/cache"
        />,
      ),
    );
    await waitFor(() => expect(document.querySelector('tr.tracked-branch-row')).toHaveAttribute('aria-current', 'true'));
    expect(screen.getByRole('button', { name: 'spike/cache' })).toHaveAttribute('aria-pressed', 'true');
  });
});
