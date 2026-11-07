/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddPrPopover } from './AddPrPopover';

const respond = (status: number, body: unknown) =>
  jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response);

const savedFetch = global.fetch;
afterEach(() => {
  global.fetch = savedFetch;
});

const openPopover = async (user: ReturnType<typeof userEvent.setup>) => {
  render(<AddPrPopover />);
  await user.click(screen.getByRole('button', { name: 'Add PR' }));
  return screen.getByRole('textbox', { name: 'PR URL, from any repo' });
};

describe('AddPrPopover', () => {
  test('opens on the URL field, and adds the PR it names', async () => {
    const user = userEvent.setup();
    const fetchMock = respond(200, { ok: true, key: 'corp/tool#8', added: true, fetched: true });
    global.fetch = fetchMock;

    const input = await openPopover(user);
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    await user.type(input, 'https://github.example.com/corp/tool/pull/8{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent('Added corp/tool#8.');
    expect(fetchMock).toHaveBeenCalledWith(
      '/view-prs/tracked-prs',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: 'https://github.example.com/corp/tool/pull/8' }) }),
    );
    expect(input).toHaveValue('');
  });

  test('says when the PR is added already', async () => {
    const user = userEvent.setup();
    global.fetch = respond(200, { ok: true, key: 'acme/api#3', added: false, fetched: true });

    const input = await openPopover(user);
    await user.type(input, 'acme/api#3');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('status')).toHaveTextContent('acme/api#3 was already added; refreshed it.');
  });

  test("shows why a PR couldn't be added, and keeps what was typed", async () => {
    const user = userEvent.setup();
    global.fetch = respond(422, { ok: false, error: "Couldn't find acme/api#404: Could not resolve to a PullRequest" });

    const input = await openPopover(user);
    await user.type(input, 'https://github.com/acme/api/pull/404{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't find acme/api#404");
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveValue('https://github.com/acme/api/pull/404');
  });

  test('says when the fetch is still going, or failed though the PR was added', async () => {
    const user = userEvent.setup();
    global.fetch = respond(202, { ok: true, key: 'acme/api#3', added: true, fetched: null });

    const input = await openPopover(user);
    await user.type(input, 'acme/api#3{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent("Added acme/api#3: still fetching it. Its row appears once it's done.");

    global.fetch = respond(200, { ok: true, key: 'acme/api#4', added: true, fetched: false, error: "gh couldn't fetch it" });
    await user.type(input, 'acme/api#4{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent("Added acme/api#4, but couldn't fetch it: gh couldn't fetch it");
  });

  test('opens afresh, without the last message', async () => {
    const user = userEvent.setup();
    global.fetch = respond(200, { ok: true, key: 'acme/api#3', added: true, fetched: true });
    const input = await openPopover(user);
    await user.type(input, 'acme/api#3{Enter}');
    await screen.findByRole('status');

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Add PR' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('Esc closes it and returns focus to its button', async () => {
    const user = userEvent.setup();
    await openPopover(user);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add PR' })).toHaveFocus();
  });
});
