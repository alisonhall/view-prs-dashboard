/** @jest-environment jsdom */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalBranchesProvider } from '../../state/LocalBranchesContext';
import { PrDataContext, type PrDataValue } from '../../state/PrDataContext';
import { LocalClonesSection } from './LocalClonesSection';

// acme/a-b and acme-a/b: names that look alike once punctuation is dropped.
const payload = { byPrNumber: { 1: { repo: 'acme/app' }, 2: { repo: 'acme/api' }, 3: { repo: 'acme/a-b' }, 4: { repo: 'acme-a/b' } } };

let saved: Record<string, unknown>;
let cleanupAnswer: { status: number; body: Record<string, unknown> };
let removeAnswer: { status: number; body: Record<string, unknown> };
const requests: Array<{ url: string; method: string; body: unknown }> = [];
const fetchMock = jest.fn(async (url: string, init: RequestInit = {}) => {
  const method = init.method || 'GET';
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  requests.push({ url, method, body });
  if (url === '/view-prs/local-repos' && method === 'PUT') {
    if (body.path === 'C:/not/a/clone') return { ok: false, status: 422, json: async () => ({ ok: false, error: 'Not a git repository' }) };
    saved = { ...saved, [body.repo]: { path: body.path, ok: true, branchCount: 1, worktreeCount: 2 } };
  }
  if (url === '/view-prs/local-repos/find') {
    if (body.folder === 'D:/empty') return { ok: true, status: 200, json: async () => ({ ok: true, found: [] }) };
    if (body.folder === 'D:/gone') return { ok: false, status: 422, json: async () => ({ ok: false, error: 'No such folder: D:/gone' }) };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        found: [
          { repo: 'acme/a-b', path: 'D:/code/a-b/main' },
          { repo: 'acme/a-b', path: 'D:/code/a-b-old' },
          { repo: 'acme/api', path: 'D:/code/api' },
          { repo: 'acme/app', path: 'D:/code/app' },
        ],
      }),
    };
  }
  if (url === '/view-prs/local-repos/checkout/check') {
    const results = (body.commands as string[]).map((command) =>
      command.startsWith('my-tool')
        ? { command, name: 'my-tool', found: true, detail: 'my-tool is a function' }
        : { command, name: command.split(' ')[0], found: false, detail: `${command.split(' ')[0]} isn't known to your shell (bash)` },
    );
    return { ok: true, status: 200, json: async () => ({ ok: true, results }) };
  }
  if (url === '/view-prs/local-repos/checkout') {
    if (body.checkout.folder === '../trees') {
      return { ok: false, status: 400, json: async () => ({ ok: false, error: 'The worktree folder needs {branch} in it' }) };
    }
    // As the server keeps them: only what's set.
    const kept = Object.fromEntries(
      Object.entries(body.checkout as Record<string, unknown>).filter(([, value]) => value && (typeof value !== 'object' || Object.keys(value).length > 0)),
    );
    const { checkout: _dropped, ...rest } = saved[body.repo] as Record<string, unknown>;
    saved = { ...saved, [body.repo]: Object.keys(kept).length > 0 ? { ...rest, checkout: kept } : rest };
  }
  if (url.startsWith('/view-prs/local-repos/cleanup?')) {
    return { ok: cleanupAnswer.status < 400, status: cleanupAnswer.status, json: async () => cleanupAnswer.body };
  }
  if (url === '/view-prs/local-repos/cleanup/remove') {
    return { ok: removeAnswer.status < 400, status: removeAnswer.status, json: async () => removeAnswer.body };
  }
  if (url === '/view-prs/local-repos' && method === 'DELETE') {
    const { [body.repo]: _dropped, ...rest } = saved;
    saved = rest;
  }
  return { ok: true, status: 200, json: async () => ({ ok: true, repos: saved, prs: {} }) };
});

beforeEach(() => {
  saved = { 'acme/api': { path: 'D:/code/api', ok: false, error: 'No such folder: D:/code/api' } };
  requests.length = 0;
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  cleanupAnswer = {
    status: 200,
    body: {
      ok: true,
      by: 'git',
      items: [
        { branch: 'old/done', oid: 'a1', worktreePath: 'D:/code/app-old_done', prs: [{ number: '3', done: true }], safe: true, reasons: [], notes: [] },
        { branch: 'only/branch', oid: 'b2', prs: [{ number: '4', done: true }], safe: true, reasons: [], notes: ['Its folder is gone already - git still lists it'] },
        { branch: 'wip', oid: 'c3', worktreePath: 'D:/code/app-wip', prs: [{ number: '5', done: true }], safe: false, reasons: ['Uncommitted: 2 changed', '1 commit not on GitHub'], notes: [] },
      ],
    },
  };
  removeAnswer = { status: 200, body: { ok: true, removed: { branch: 'old/done', worktreePath: 'D:/code/app-old_done' }, how: 'git', output: '' } };
});

const renderSection = () =>
  render(
    <PrDataContext.Provider value={{ payload } as unknown as PrDataValue}>
      <LocalBranchesProvider>
        <LocalClonesSection />
      </LocalBranchesProvider>
    </PrDataContext.Provider>,
  );

describe('Settings › Local clones', () => {
  test("lists the page's repos with their clone's folder, saying when one can't be read", async () => {
    renderSection();
    expect(await screen.findByRole('alert')).toHaveTextContent('No such folder: D:/code/api');
    expect(screen.getByLabelText('acme/api')).toHaveValue('D:/code/api');
    expect(screen.getByLabelText('acme/app')).toHaveValue('');
    // Each repo's field is its own.
    expect(screen.getByLabelText('acme/a-b')).not.toBe(screen.getByLabelText('acme-a/b'));
  });

  test('saves a folder once the server finds the clone, shows what it has, and checks the PRs again', async () => {
    const user = userEvent.setup();
    renderSection();
    await user.type(screen.getByLabelText('acme/app'), 'C:/not/a/clone');
    await user.click(screen.getByRole('button', { name: "Save the clone's folder for acme/app" }));
    expect(await screen.findByText('Not a git repository')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('acme/app'));
    await user.type(screen.getByLabelText('acme/app'), 'D:/code/app');
    requests.length = 0;
    await user.click(screen.getByRole('button', { name: "Save the clone's folder for acme/app" }));
    const item = screen.getByLabelText('acme/app').closest('li') as HTMLElement;
    expect(await within(item).findByText('1 branch, 2 worktrees')).toBeInTheDocument();
    expect(requests[0]).toEqual({ url: '/view-prs/local-repos', method: 'PUT', body: { repo: 'acme/app', path: 'D:/code/app' } });
    await waitFor(() => expect(requests.some((request) => request.url === '/view-prs/local-branches')).toBe(true));
    // Saved: nothing to save until it's changed.
    expect(within(item).getByRole('button', { name: "Save the clone's folder for acme/app" })).toBeDisabled();
  });

  test("Find offers the clones of the page's repos in a folder; Use saves one, and Use all the first of each repo without one", async () => {
    const user = userEvent.setup();
    renderSection();
    const field = screen.getByLabelText('Find clones in a folder');
    await user.type(field, 'D:/gone');
    await user.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByText('No such folder: D:/gone')).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, 'D:/empty');
    await user.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByText(/No clones of these repos there/)).toBeInTheDocument();

    await user.clear(field);
    await user.type(field, 'D:/code');
    requests.length = 0;
    await user.click(screen.getByRole('button', { name: 'Find' }));
    const found = await screen.findByRole('list', { name: 'Clones found' });
    expect(requests[0]).toEqual({
      url: '/view-prs/local-repos/find',
      method: 'POST',
      body: { folder: 'D:/code', repos: ['acme-a/b', 'acme/a-b', 'acme/api', 'acme/app'] },
    });
    expect(within(found).getAllByRole('listitem')).toHaveLength(4);
    // acme/api's saved folder is the one found.
    expect(within(found).getAllByText('Saved')).toHaveLength(1);

    // Use all skips acme/api, which has a clone saved, and takes a-b's first.
    requests.length = 0;
    await user.click(screen.getByRole('button', { name: 'Use all (2)' }));
    await waitFor(() => expect(within(found).getAllByText('Saved')).toHaveLength(3));
    expect(requests.filter((request) => request.method === 'PUT').map((request) => request.body)).toEqual([
      { repo: 'acme/a-b', path: 'D:/code/a-b/main' },
      { repo: 'acme/app', path: 'D:/code/app' },
    ]);
    expect(screen.getByLabelText('acme/app')).toHaveValue('D:/code/app');

    // One by one: a-b's other clone instead.
    await user.click(screen.getByRole('button', { name: 'Use D:/code/a-b-old for acme/a-b' }));
    await waitFor(() => expect(screen.getByLabelText('acme/a-b')).toHaveValue('D:/code/a-b-old'));
  });

  test("Use all also replaces a saved folder that can't be read (moved or deleted since)", async () => {
    saved = { 'acme/api': { path: 'D:/old/api', ok: false, error: 'No such folder: D:/old/api' } };
    const user = userEvent.setup();
    renderSection();
    await user.type(screen.getByLabelText('Find clones in a folder'), 'D:/code');
    await user.click(screen.getByRole('button', { name: 'Find' }));
    requests.length = 0;
    await user.click(await screen.findByRole('button', { name: 'Use all (3)' }));
    await waitFor(() => expect(screen.getByLabelText('acme/api')).toHaveValue('D:/code/api'));
    expect(requests.filter((request) => request.method === 'PUT').map((request) => (request.body as { repo: string }).repo)).toEqual(['acme/a-b', 'acme/api', 'acme/app']);
  });

  test("a repo's Check out: git by default, or the user's own command - for forks' PRs too if asked - with an after-command, a folder and variables", async () => {
    saved = { 'acme/app': { path: 'D:/code/app/main', ok: true, branchCount: 1, worktreeCount: 1 } };
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByText('Check out PRs with git'));
    expect(screen.getByLabelText('Checkout command')).toHaveValue('');
    const forks = screen.getByLabelText(/Use it for forks' PRs too/);
    expect(forks).toBeDisabled();

    await user.type(screen.getByLabelText('Checkout command'), 'my-tool add {{branch}');
    await user.click(forks);
    await user.type(screen.getByLabelText('After git makes a worktree, run'), 'my-tool link {{local}');
    await user.type(screen.getByLabelText("Folder for git's worktrees"), '../{{branch}');
    await user.type(screen.getByLabelText('Clean up: list command'), 'my-tool clean --porcelain');
    await user.type(screen.getByLabelText('Clean up: remove command'), 'my-tool rm {{worktree} --yes');
    await user.type(screen.getByLabelText('Variables'), 'export MY_DEV_BRANCH="develop"{Enter}# a note{Enter}MY_LINKS=.env .cache');
    await user.click(screen.getByRole('button', { name: "Save how to check out acme/app's PRs" }));
    expect(await screen.findByText('my-tool add {branch}')).toBeInTheDocument();
    expect(requests.find((request) => request.url === '/view-prs/local-repos/checkout')?.body).toEqual({
      repo: 'acme/app',
      checkout: {
        command: 'my-tool add {branch}',
        forks: true,
        after: 'my-tool link {local}',
        folder: '../{branch}',
        env: { MY_DEV_BRANCH: 'develop', MY_LINKS: '.env .cache' },
        cleanupList: 'my-tool clean --porcelain',
        cleanupRemove: 'my-tool rm {worktree} --yes',
      },
    });

    // Not NAME=value: said so, nothing sent.
    requests.length = 0;
    await user.type(screen.getByLabelText('Variables'), '{Enter}not a setting');
    await user.click(screen.getByRole('button', { name: "Save how to check out acme/app's PRs" }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not NAME=value: not a setting');
    expect(requests).toHaveLength(0);

    // Back to git: no command, so not for forks either.
    await user.clear(screen.getByLabelText('Variables'));
    await user.clear(screen.getByLabelText('Checkout command'));
    await user.click(screen.getByRole('button', { name: "Save how to check out acme/app's PRs" }));
    expect(await screen.findByText('Check out PRs with git')).toBeInTheDocument();
    expect((requests.at(-1)?.body as { checkout: { forks: boolean } }).checkout.forks).toBe(false);
  });

  test("a repo's checkout settings copied from another's; one the server refuses says why", async () => {
    saved = {
      'acme/app': { path: 'D:/code/app/main', ok: true, branchCount: 1, worktreeCount: 1, checkout: { command: 'app-tool add {branch}', env: { MY_X: '1' } } },
      'acme/api': { path: 'D:/code/api/main', ok: true, branchCount: 1, worktreeCount: 1 },
    };
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByText('Check out PRs with git'));
    const save = screen.getByRole('button', { name: "Save how to check out acme/api's PRs" });
    const form = within(save.closest('form') as HTMLElement);
    // The only other repo with settings: acme/app (none to copy from in its own).
    const copy = form.getByLabelText('Copy from');
    expect(within(copy).getAllByRole('option').map((option) => option.textContent)).toEqual(["Another repo's settings…", 'acme/app']);
    expect(screen.getAllByLabelText('Copy from')).toHaveLength(1);
    await user.selectOptions(copy, 'acme/app');
    expect(form.getByLabelText('Checkout command')).toHaveValue('app-tool add {branch}');
    expect(form.getByLabelText('Variables')).toHaveValue('MY_X=1');

    await user.type(form.getByLabelText("Folder for git's worktrees"), '../trees');
    await user.click(save);
    expect(await form.findByRole('alert')).toHaveTextContent('The worktree folder needs {branch} in it');
  });

  test("Check commands asks whether the user's shell knows each command; a placeholder in single quotes is warned of", async () => {
    saved = { 'acme/app': { path: 'D:/code/app/main', ok: true, branchCount: 1, worktreeCount: 1 } };
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByText('Check out PRs with git'));
    const checkButton = screen.getByRole('button', { name: 'Check commands' });
    expect(checkButton).toBeDisabled();

    await user.type(screen.getByLabelText('Checkout command'), 'my-tool add {{branch}');
    await user.type(screen.getByLabelText('After git makes a worktree, run'), "nope '{{local}' x");
    expect(screen.getByText(/\{local\} inside single quotes is taken as written/)).toBeInTheDocument();
    expect(screen.getAllByText(/inside single quotes/)).toHaveLength(1);

    await user.click(checkButton);
    const answers = await screen.findByRole('status', { name: 'What your shell knows' });
    expect(within(answers).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '✓ my-tool: my-tool is a function',
      "✗ nope: nope isn't known to your shell (bash)",
    ]);
    expect(requests.find((request) => request.url === '/view-prs/local-repos/checkout/check')?.body).toEqual({
      repo: 'acme/app',
      commands: ['my-tool add {branch}', "nope '{local}' x"],
    });
  });

  test("Clean up: looks when asked; each safe item removable after asking, the rest kept with why; a refusal says why", async () => {
    saved = { 'acme/app': { path: 'D:/code/app/main', ok: true, branchCount: 3, worktreeCount: 3 } };
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      const user = userEvent.setup();
      renderSection();
      await user.click(await screen.findByText('Clean up after merged and closed PRs'));
      expect(requests.some((request) => request.url.startsWith('/view-prs/local-repos/cleanup'))).toBe(false);
      await user.click(screen.getByRole('button', { name: 'Look' }));
      expect(await screen.findByText('2 of 3 safe to remove.')).toBeInTheDocument();
      expect(requests.find((request) => request.url.startsWith('/view-prs/local-repos/cleanup'))?.url).toBe('/view-prs/local-repos/cleanup?repo=acme%2Fapp');
      const list = screen.getByRole('list', { name: "What can be cleaned up in acme/app's clone" });
      expect(within(list).getByText('Kept: Uncommitted: 2 changed; 1 commit not on GitHub')).toBeInTheDocument();
      expect(within(list).queryByRole('button', { name: 'Remove wip' })).toBeNull();

      await user.click(within(list).getByRole('button', { name: 'Remove old/done' }));
      expect(confirm).toHaveBeenCalledWith('Remove the worktree D:/code/app-old_done and the branch old/done?');
      expect(requests.some((request) => request.url === '/view-prs/local-repos/cleanup/remove')).toBe(false);

      confirm.mockReturnValue(true);
      await user.click(within(list).getByRole('button', { name: 'Remove old/done' }));
      await waitFor(() => expect(within(list).queryByText('old/done')).toBeNull());
      expect(requests.find((request) => request.url === '/view-prs/local-repos/cleanup/remove')?.body).toEqual({
        repo: 'acme/app',
        branch: 'old/done',
        worktreePath: 'D:/code/app-old_done',
      });

      removeAnswer = { status: 409, body: { ok: false, error: 'Not safe to remove: Uncommitted: 1 new' } };
      await user.click(within(list).getByRole('button', { name: 'Remove only/branch' }));
      expect(confirm).toHaveBeenLastCalledWith('Remove the branch only/branch?\n\nIts folder is gone already - git still lists it');
      expect(await within(list).findByRole('alert')).toHaveTextContent('Not safe to remove: Uncommitted: 1 new');
      expect(within(list).getByText('only/branch')).toBeInTheDocument();
    } finally {
      confirm.mockRestore();
    }
  });

  test("Clean up with the repo's own commands: their worktrees, lines that aren't left out, and what the command said; a failure says why", async () => {
    saved = {
      'acme/app': {
        path: 'D:/code/app/main',
        ok: true,
        branchCount: 1,
        worktreeCount: 2,
        checkout: { cleanupList: 'my-tool clean --porcelain', cleanupRemove: 'my-tool rm {worktree}' },
      },
    };
    cleanupAnswer = {
      status: 200,
      body: {
        ok: true,
        by: 'command',
        items: [{ branch: 'mine', oid: 'a', worktreePath: 'D:/code/mine', prs: [], safe: true, reasons: [], notes: ["No PR on the page has this branch, so what's pushed isn't checked"] }],
        ignored: ['/not/one'],
        output: 'why: old',
      },
    };
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      const user = userEvent.setup();
      renderSection();
      await user.click(await screen.findByText('Clean up after merged and closed PRs'));
      expect(screen.getByText(/^The worktrees your list command printed/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Look' }));
      expect(await screen.findByText('Not worktrees of the clone, so left out: "/not/one"')).toBeInTheDocument();
      expect(screen.getByText('why: old')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Remove mine' }));
      // The branch is the command's: only the worktree is named.
      expect(confirm).toHaveBeenCalledWith(
        "Remove the worktree D:/code/mine (by your remove command)?\n\nNo PR on the page has this branch, so what's pushed isn't checked",
      );

      cleanupAnswer = { status: 502, body: { ok: false, error: 'The list command failed: no such layout' } };
      await user.click(screen.getByRole('button', { name: 'Look again' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('The list command failed: no such layout');
    } finally {
      confirm.mockRestore();
    }
  });

  test("Remove forgets a repo's folder", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole('button', { name: "Remove the clone's folder for acme/api" }));
    await waitFor(() => expect(screen.queryByRole('button', { name: "Remove the clone's folder for acme/api" })).toBeNull());
    expect(requests.find((request) => request.method === 'DELETE')?.body).toEqual({ repo: 'acme/api' });
    expect(screen.getByLabelText('acme/api')).toHaveValue('');
  });
});
