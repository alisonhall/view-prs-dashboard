/** @jest-environment jsdom */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalBranchesProvider } from '../../state/LocalBranchesContext';
import { PrDataContext, type PrDataValue } from '../../state/PrDataContext';
import { LocalClonesSection } from './LocalClonesSection';

// acme/a-b and acme-a/b: names that look alike once punctuation is dropped.
const payload = { byPrNumber: { 1: { repo: 'acme/app' }, 2: { repo: 'acme/api' }, 3: { repo: 'acme/a-b' }, 4: { repo: 'acme-a/b' } } };

let saved: Record<string, unknown>;
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

  test("Remove forgets a repo's folder", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole('button', { name: "Remove the clone's folder for acme/api" }));
    await waitFor(() => expect(screen.queryByRole('button', { name: "Remove the clone's folder for acme/api" })).toBeNull());
    expect(requests.find((request) => request.method === 'DELETE')?.body).toEqual({ repo: 'acme/api' });
    expect(screen.getByLabelText('acme/api')).toHaveValue('');
  });
});
