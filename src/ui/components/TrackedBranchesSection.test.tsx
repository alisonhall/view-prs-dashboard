/** @jest-environment jsdom */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EMPTY_LOCAL_BRANCHES, LocalBranchesContext, type LocalBranchesValue } from '../state/LocalBranchesContext';
import { SnackbarContext, type SnackbarValue } from '../state/SnackbarContext';
import { SearchTermsContext } from '../state/SearchTermsContext';
import { TrackedBranchesSection } from './TrackedBranchesSection';
import { TrackBranchPicker } from './TrackBranchPicker';

let candidates: Record<string, unknown[]>;
let starts: Record<string, unknown[]>;
let changes: Record<string, unknown>;
let posted: Array<{ url: string; method: string; body: unknown }>;
const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
  if (init?.method && init.method !== 'GET') {
    const body = JSON.parse(String(init.body || '{}'));
    posted.push({ url, method: init.method, body });
    if (url.endsWith('/tracked-branches/new')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, branch: body.name, worktreePath: `D:/code/app-${String(body.name).replace(/\//g, "_")}`, startedFrom: 'origin/main' }) };
    }
    if (url.endsWith('/tracked-branches/pull')) return { ok: true, status: 200, json: async () => ({ ok: true, commits: 2 }) };
    return { ok: true, status: 200, json: async () => ({ ok: true, added: true }) };
  }
  if (url.startsWith('/view-prs/local-repos/branches?')) {
    const query = new URLSearchParams(url.split('?')[1]);
    const repo = query.get('repo') || '';
    return { ok: true, status: 200, json: async () => ({ ok: true, branches: candidates[repo] || [], ...(query.get('starts') ? { starts: starts[repo] || [] } : {}) }) };
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
    upstream: { remote: 'origin', branch: 'spike/cache', ahead: 0, behind: 3 },
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
    candidates = {
      'acme/app': [
        { name: 'main', oid: 'm', upstream: 'origin/main', main: true },
        { name: 'other-work', oid: 'abc', committedAt: new Date().toISOString(), subject: 'Start' },
      ],
    };
    starts = {};
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
    expect(rows[0]).toHaveTextContent('2 not pushed');
    expect(rows[0]).toHaveTextContent('3 behind');
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

  test('Untrack stops tracking it, and Undo puts it back as it was, note and all', async () => {
    const user = userEvent.setup();
    render(wrap(<TrackedBranchesSection trackedBranches={TRACKED} isOpen onToggleSection={jest.fn()} />, local({ branches: STATUSES })));
    await user.click(screen.getByRole('button', { name: 'Untrack spike/cache' }));
    expect(posted).toEqual([{ url: '/view-prs/tracked-branches', method: 'DELETE', body: { repo: 'acme/app', branch: 'spike/cache' } }]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(await screen.findByText('Untracked spike/cache (and its note).')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(posted[1]).toEqual({
      url: '/view-prs/tracked-branches',
      method: 'POST',
      body: { repo: 'acme/app', branch: 'spike/cache', note: 'Try Redis', restore: true },
    });
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  test("a row's note is written there: added, changed, cleared; Escape leaves it as it was", async () => {
    const user = userEvent.setup();
    render(wrap(<TrackedBranchesSection trackedBranches={TRACKED} isOpen onToggleSection={jest.fn()} />, local({ branches: STATUSES })));
    await user.click(screen.getByRole('button', { name: 'Add a note to wip' }));
    const box = screen.getByRole('textbox', { name: 'Note on wip' });
    await user.type(box, 'Half done');
    await user.click(screen.getByRole('button', { name: 'Save note' }));
    expect(posted).toEqual([{ url: '/view-prs/tracked-branches', method: 'PATCH', body: { repo: 'acme/app', branch: 'wip', note: 'Half done' } }]);
    expect(await screen.findByLabelText('Note: Half done')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(screen.getByLabelText('Note: Try Redis'));
    const existing = screen.getByRole('textbox', { name: 'Note on spike/cache' });
    expect(existing).toHaveValue('Try Redis');
    await user.type(existing, ' later{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(posted).toHaveLength(1);

    // Ctrl+Enter with nothing changed sends nothing.
    await user.click(screen.getByLabelText('Note: Try Redis'));
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(posted).toHaveLength(1);
    await user.clear(screen.getByRole('textbox', { name: 'Note on spike/cache' }));
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(posted[1]).toEqual({ url: '/view-prs/tracked-branches', method: 'PATCH', body: { repo: 'acme/app', branch: 'spike/cache', note: '' } });
    expect(await screen.findByRole('button', { name: 'Add a note to spike/cache' })).toBeInTheDocument();

    // Untracked before the data has caught up: Undo gives back the note as written here.
    await user.click(screen.getByRole('button', { name: 'Untrack wip' }));
    expect(await screen.findByText('Untracked wip (and its note).')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(posted.at(-1)).toEqual({ url: '/view-prs/tracked-branches', method: 'POST', body: { repo: 'acme/app', branch: 'wip', note: 'Half done', restore: true } });
  });

  test('Pull, after asking: the remote branch fetched and the branch fast-forwarded; only for one tracking a remote branch', async () => {
    const user = userEvent.setup();
    const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    try {
      render(wrap(<TrackedBranchesSection trackedBranches={TRACKED} isOpen onToggleSection={jest.fn()} />, local({ branches: STATUSES })));
      expect(screen.queryByRole('button', { name: 'Pull wip' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Pull spike/cache' }));
      expect(confirm.mock.calls[0]?.[0]).toContain('Pull origin/spike/cache into spike/cache (checked out in D:/code/app-spike)?');
      expect(confirm.mock.calls[0]?.[0]).toContain('3 new commits as of the last fetch');
      expect(posted).toEqual([]);
      await user.click(screen.getByRole('button', { name: 'Pull spike/cache' }));
      expect(posted).toEqual([{ url: '/view-prs/tracked-branches/pull', method: 'POST', body: { repo: 'acme/app', branch: 'spike/cache' } }]);
      expect(await screen.findByText('Pulled 2 commits into spike/cache.')).toBeInTheDocument();
      expect(refresh).toHaveBeenCalled();
    } finally {
      confirm.mockRestore();
    }
  });

  test("New branch from a row: named, from that branch's newest, in a new worktree (or as the repo last chose), then tracked", async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <TrackedBranchesSection trackedBranches={TRACKED} isOpen onToggleSection={jest.fn()} />,
        local({ branches: STATUSES, repos: { 'acme/app': { path: 'D:/code/app', ok: true, newBranch: 'switch' } } }),
      ),
    );
    expect(screen.queryByRole('button', { name: 'New branch from wip' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New branch from spike/cache' }));
    const form = screen.getByRole('form', { name: 'New branch from spike/cache' });
    // The repo's last choice first.
    expect(within(form).getByRole('radio', { name: /Switch the clone \(app\)/ })).toBeChecked();
    await user.click(within(form).getByRole('radio', { name: /A new worktree/ }));
    await user.type(within(form).getByRole('textbox', { name: 'New branch' }), 'spike/cache-2');
    await user.click(within(form).getByRole('button', { name: 'Make and track it' }));
    expect(posted).toEqual([
      { url: '/view-prs/tracked-branches/new', method: 'POST', body: { repo: 'acme/app', name: 'spike/cache-2', start: 'refs/heads/spike/cache', fetch: true, mode: 'worktree' } },
    ]);
    expect(await screen.findByText('Made spike/cache-2 from origin/main in app-spike_cache-2, and tracking it.')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  test("closed, the header says how many local branches could still be tracked; it opens the section with the picker", async () => {
    const user = userEvent.setup();
    const onToggleSection = jest.fn();
    const { rerender } = render(wrap(<TrackedBranchesSection trackedBranches={[]} isOpen={false} onToggleSection={onToggleSection} />));
    await screen.findByRole('button', { name: '1 local branch with no PR' });
    // A branch made since counts once the page is focused again.
    candidates['acme/app'] = [...(candidates['acme/app'] || []), { name: 'newer', oid: 'def', subject: 'More' }];
    window.dispatchEvent(new Event('focus'));
    const hint = await screen.findByRole('button', { name: '2 local branches with no PR' });
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
    expect(await screen.findByText(/Nothing left to track in acme\/web/)).toBeInTheDocument();
    unmount();
    render(wrap(<TrackBranchPicker />, local({ repos: {} })));
    expect(screen.getByText(/Save a clone in Settings › Local clones first/)).toBeInTheDocument();
  });

  test('the main branches come first, marked; New branch starts from any branch of the clone, local or remote', async () => {
    const user = userEvent.setup();
    candidates['acme/app'] = [{ name: 'main', oid: 'm', upstream: 'origin/main', main: true }, ...(candidates['acme/app'] || [])];
    starts = {
      'acme/app': [
        { ref: 'refs/heads/main', name: 'main' },
        { ref: 'refs/heads/other-work', name: 'other-work' },
        { ref: 'refs/remotes/origin/release', name: 'origin/release', remote: true },
      ],
    };
    const onTracked = jest.fn();
    render(wrap(<TrackBranchPicker onTracked={onTracked} />));
    const first = (await screen.findAllByRole('listitem'))[0] as HTMLElement;
    expect(first).toHaveTextContent('mainmain branch');
    await user.click(screen.getByRole('button', { name: 'New branch…' }));
    const form = await screen.findByRole('form', { name: 'New branch in acme/app' });
    const from = within(form).getByRole('combobox', { name: 'from' });
    expect(within(from).getAllByRole('option').map((option) => option.textContent)).toEqual(['main', 'other-work', 'origin/release']);
    await user.selectOptions(from, 'refs/remotes/origin/release');
    await user.type(within(form).getByRole('textbox', { name: 'New branch' }), 'hotfix');
    await user.click(within(form).getByRole('checkbox', { name: /Fetch it first/ }));
    await user.click(within(form).getByRole('button', { name: 'Make and track it' }));
    expect(posted).toEqual([
      { url: '/view-prs/tracked-branches/new', method: 'POST', body: { repo: 'acme/app', name: 'hotfix', start: 'refs/remotes/origin/release', fetch: false, mode: 'worktree' } },
    ]);
    expect(await screen.findByText(/Made hotfix from origin\/main in app-hotfix, and tracking it/)).toBeInTheDocument();
    expect(onTracked).toHaveBeenCalledWith('acme/app', 'hotfix');
  });

  test('a clone with many branches gets a filter: by name or commit subject', async () => {
    const user = userEvent.setup();
    candidates['acme/app'] = Array.from({ length: 8 }, (_, index) => ({ name: `feature-${index}`, oid: String(index), subject: index === 3 ? 'Fix login' : 'Work' }));
    render(wrap(<TrackBranchPicker />));
    const filter = await screen.findByRole('searchbox', { name: "Filter acme/app's branches" });
    await user.type(filter, 'login');
    expect(screen.getAllByRole('button', { name: /^Track / }).map((button) => button.getAttribute('aria-label'))).toEqual(['Track feature-3']);
    await user.clear(filter);
    await user.type(filter, 'feature-7');
    expect(screen.getAllByRole('button', { name: /^Track / })).toHaveLength(1);
    await user.type(filter, 'x');
    expect(screen.getByText('No branch matches “feature-7x”.')).toBeInTheDocument();
  });

  test("the filter is cleared on choosing another clone, so one with few branches (no box) isn't left filtered", async () => {
    const user = userEvent.setup();
    candidates['acme/app'] = Array.from({ length: 8 }, (_, index) => ({ name: `feature-${index}`, oid: String(index) }));
    candidates['acme/web'] = [{ name: 'web-work', oid: 'w' }];
    render(wrap(<TrackBranchPicker />, local({ repos: { 'acme/app': { path: 'a', ok: true }, 'acme/web': { path: 'b', ok: true } } })));
    await user.type(await screen.findByRole('searchbox'), 'zzz');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Clone' }), 'acme/web');
    expect(await screen.findByRole('button', { name: 'Track web-work' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Clone' }), 'acme/app');
    expect(await screen.findByRole('searchbox')).toHaveValue('');
  });
});
