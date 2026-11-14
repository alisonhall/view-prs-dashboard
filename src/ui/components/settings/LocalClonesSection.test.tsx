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

  test("Remove forgets a repo's folder", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(await screen.findByRole('button', { name: "Remove the clone's folder for acme/api" }));
    await waitFor(() => expect(screen.queryByRole('button', { name: "Remove the clone's folder for acme/api" })).toBeNull());
    expect(requests.find((request) => request.method === 'DELETE')?.body).toEqual({ repo: 'acme/api' });
    expect(screen.getByLabelText('acme/api')).toHaveValue('');
  });
});
