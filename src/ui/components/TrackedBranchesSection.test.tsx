/** @jest-environment jsdom */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EMPTY_LOCAL_BRANCHES, LocalBranchesContext, type LocalBranchesValue } from '../state/LocalBranchesContext';
import { SnackbarContext, type SnackbarValue } from '../state/SnackbarContext';
import { SearchTermsContext } from '../state/SearchTermsContext';
import { TrackedBranchesSection } from './TrackedBranchesSection';
import { TrackBranchPicker } from './TrackBranchPicker';

let candidates: Record<string, unknown[]>;
let changes: Record<string, unknown>;
let posted: Array<{ url: string; method: string; body: unknown }>;
const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
  if (init?.method && init.method !== 'GET') {
    posted.push({ url, method: init.method, body: JSON.parse(String(init.body || '{}')) });
    return { ok: true, status: 200, json: async () => ({ ok: true, added: true }) };
  }
  if (url.startsWith('/view-prs/local-repos/branches?')) {
    const repo = new URLSearchParams(url.split('?')[1]).get('repo') || '';
    return { ok: true, status: 200, json: async () => ({ ok: true, branches: candidates[repo] || [] }) };
  }
  if (url === '/view-prs/tracked-branches/changes') return { ok: true, status: 200, json: async () => ({ ok: true, changes }) };
  return { ok: false, status: 404, json: async () => ({ ok: false }) };
});

const showError = jest.fn();
const refresh = jest.fn();
const local = (overrides: Partial<LocalBranchesValue> = {}): LocalBranchesValue => ({
  ...EMPTY_LOCAL_BRANCHES,
  loaded: true,
  refresh,
  repos: { 'acme/app': { path: 'D:/code/app', ok: true } },
  ...overrides,
});

const wrap = (ui: React.ReactNode, value: LocalBranchesValue = local(), searchTerms: string[] = []) => (
  <SnackbarContext.Provider value={{ showError, showWarning: jest.fn() } as unknown as SnackbarValue}>
    <LocalBranchesContext.Provider value={value}>
      <SearchTermsContext.Provider value={searchTerms}>{ui}</SearchTermsContext.Provider>
    </LocalBranchesContext.Provider>
  </SnackbarContext.Provider>
);

const TRACKED = [
  { repo: 'acme/app', branch: 'spike/cache', note: 'Try Redis' },
  { repo: 'acme/app', branch: 'wip' },
  { repo: 'other/lib', branch: 'elsewhere' },
];
const STATUSES = {
  'acme/app:spike/cache': {
    found: true,
    branch: 'spike/cache',
    committedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    subject: 'Add cache',
    worktreePath: 'D:/code/app-spike',
    pushed: false,
    unpushed: 2,
    base: 'main',
    baseAhead: 2,
    baseBehind: 5,
  },
  'acme/app:wip': { found: false },
};

describe('TrackedBranchesSection', () => {
  beforeEach(() => {
    candidates = { 'acme/app': [{ name: 'other-work', oid: 'abc', committedAt: new Date().toISOString(), subject: 'Start' }] };
    changes = { 'acme/app:spike/cache': { worktreePath: 'D:/code/app-spike', staged: 0, changed: 1, untracked: 0, conflicted: 0, total: 1, files: [{ path: 'a.ts', code: ' M' }] } };
    posted = [];
    fetchMock.mockClear();
    showError.mockClear();
    refresh.mockClear();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  test("each branch's row: where it is, its status with uncommitted changes, and its newest commit; one not here says so", async () => {
    render(wrap(<TrackedBranchesSection trackedBranches={TRACKED} isOpen onToggleSection={jest.fn()} />, local({ branches: STATUSES })));
    const table = screen.getByRole('table', { name: 'Tracked Branches' });
    const rows = within(table).getAllByRole('row').slice(1);
    // Newest commit first; those this computer can't say for last.
    expect(rows.map((row) => row.getAttribute('data-branch-key'))).toEqual(['acme/app:spike/cache', 'acme/app:wip', 'other/lib:elsewhere']);
    expect(rows[0]).toHaveTextContent('app-spike');
    expect(rows[0]).toHaveTextContent('Local only · 2 commits');
    expect(rows[0]).toHaveTextContent('2 ahead, 5 behind main');
    expect(rows[0]).toHaveTextContent('3d ago');
    await waitFor(() => expect(rows[0]).toHaveTextContent('1 uncommitted'));
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: 'Open spike/cache in the editor' })).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent('Not on this computer');
    expect(rows[1]).toHaveTextContent('Branch not found');
    expect(within(rows[1] as HTMLElement).queryByRole('button', { name: /in the editor/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Note: Try Redis')).toBeInTheDocument();
    expect(document.querySelector('.pr-section-count')).toHaveTextContent('3');
  });

  test('the search narrows the rows; with none tracked it says how to add one', () => {
    const { unmount } = render(
      wrap(<TrackedBranchesSection trackedBranches={TRACKED} isOpen onToggleSection={jest.fn()} />, local({ branches: STATUSES }), ['redis']),
    );
    expect(screen.getAllByRole('row')).toHaveLength(2);
    unmount();
    render(wrap(<TrackedBranchesSection trackedBranches={[]} isOpen onToggleSection={jest.fn()} />));
    expect(screen.getByText(/No branches tracked yet/)).toBeInTheDocument();
  });

  test('Untrack stops tracking it', async () => {
    const user = userEvent.setup();
    render(wrap(<TrackedBranchesSection trackedBranches={TRACKED} isOpen onToggleSection={jest.fn()} />, local({ branches: STATUSES })));
    await user.click(screen.getByRole('button', { name: 'Untrack wip' }));
    expect(posted).toEqual([{ url: '/view-prs/tracked-branches', method: 'DELETE', body: { repo: 'acme/app', branch: 'wip' } }]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  test("closed, the header says how many local branches could still be tracked; it opens the section with the picker", async () => {
    const user = userEvent.setup();
    const onToggleSection = jest.fn();
    const { rerender } = render(wrap(<TrackedBranchesSection trackedBranches={[]} isOpen={false} onToggleSection={onToggleSection} />));
    const hint = await screen.findByRole('button', { name: '1 local branch with no PR' });
    await user.click(hint);
    expect(onToggleSection).toHaveBeenCalledWith('tracked-branches', true);
    rerender(wrap(<TrackedBranchesSection trackedBranches={[]} isOpen onToggleSection={onToggleSection} />));
    expect(await screen.findByRole('button', { name: 'Track other-work' })).toBeInTheDocument();
  });
});

describe('TrackBranchPicker', () => {
  beforeEach(() => {
    posted = [];
    candidates = {
      'acme/app': [{ name: 'other-work', oid: 'abc', upstream: 'origin/other-work', worktreePath: 'D:/code/app-other', subject: 'Start' }],
      'acme/web': [],
    };
    refresh.mockClear();
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  test("lists a clone's local branches with no PR, and tracks one", async () => {
    const user = userEvent.setup();
    const onTracked = jest.fn();
    render(wrap(<TrackBranchPicker onTracked={onTracked} />));
    const item = (await screen.findByRole('button', { name: 'Track other-work' })).closest('li') as HTMLElement;
    expect(item).toHaveTextContent('in app-other · tracks origin/other-work');
    await user.click(within(item).getByRole('button', { name: 'Track other-work' }));
    expect(posted).toEqual([{ url: '/view-prs/tracked-branches', method: 'POST', body: { repo: 'acme/app', branch: 'other-work' } }]);
    expect(await screen.findByText('Tracking other-work.')).toBeInTheDocument();
    expect(onTracked).toHaveBeenCalledWith('acme/app', 'other-work');
    expect(refresh).toHaveBeenCalled();
  });

  test('with several clones, one is chosen; one with nothing to track says so; with no clone, says to save one', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      wrap(<TrackBranchPicker />, local({ repos: { 'acme/app': { path: 'a', ok: true }, 'acme/web': { path: 'b', ok: true }, 'acme/gone': { path: 'c', ok: false } } })),
    );
    const select = screen.getByRole('combobox', { name: 'Clone' });
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['acme/app', 'acme/web']);
    await user.selectOptions(select, 'acme/web');
    expect(await screen.findByText(/No local branches without a PR in acme\/web/)).toBeInTheDocument();
    unmount();
    render(wrap(<TrackBranchPicker />, local({ repos: {} })));
    expect(screen.getByText(/Save a clone in Settings › Local clones first/)).toBeInTheDocument();
  });
});
