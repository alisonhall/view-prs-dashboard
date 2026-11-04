/** @jest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrDataContext, type PrDataValue } from '../../state/PrDataContext';
import type { PrDataPayload, PrSources } from '../../types/pr-data.ts';
import { SourcesSection } from './SourcesSection';

const SOURCES: PrSources = {
  subscriptions: [
    { repo: 'acme/api', mode: 'recent' },
    { repo: 'acme/web', mode: 'numbers', numbers: ['4', '7'] },
  ],
  trackedPrs: [
    { repo: 'other/lib', number: '9', url: 'https://github.com/other/lib/pull/9', addedAt: '2026-11-04T09:00:00Z' },
    { repo: 'corp/tool', number: '3', url: 'https://github.example.com/corp/tool/pull/3' },
  ],
  unreachable: { 'corp/tool#3': '2026-11-04T10:00:00Z' },
};

const renderSection = (sources: PrSources | null = SOURCES) => {
  const payload = { ok: true, byPrNumber: {}, dataMeta: { sources } } as unknown as PrDataPayload;
  return render(
    <PrDataContext.Provider value={{ payload } as unknown as PrDataValue}>
      <SourcesSection />
    </PrDataContext.Provider>,
  );
};

const respondWith = (body: unknown, status = 200) =>
  jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response);

const savedFetch = global.fetch;
afterEach(() => {
  global.fetch = savedFetch;
});

const item = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

describe('SourcesSection', () => {
  test('lists the subscriptions with what each follows, and the PRs added one by one, marking one that couldn\'t be fetched', () => {
    renderSection();

    expect(within(item('acme/api')).getByRole('combobox')).toHaveValue('recent');
    expect(within(item('acme/web')).getByRole('combobox')).toHaveValue('numbers');
    expect(within(item('acme/web')).getByRole('textbox', { name: 'PR numbers to follow in acme/web' })).toHaveValue('4, 7');
    expect(screen.getByRole('link', { name: 'other/lib#9' })).toHaveAttribute('href', 'https://github.com/other/lib/pull/9');
    expect(within(item('corp/tool#3')).getByText("Couldn't fetch")).toBeInTheDocument();
    expect(within(item('other/lib#9')).queryByText("Couldn't fetch")).not.toBeInTheDocument();
  });

  test('unsubscribing a repo shows the sources the server answers with', async () => {
    const user = userEvent.setup();
    const fetchMock = respondWith({ ok: true, removed: true, sources: { ...SOURCES, subscriptions: [SOURCES.subscriptions[1]] } });
    global.fetch = fetchMock;
    renderSection();

    await user.click(within(item('acme/api')).getByRole('button', { name: 'Unsubscribe' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/view-prs/subscriptions',
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ repo: 'acme/api' }) }),
    );
    expect(await screen.findByText('acme/web')).toBeInTheDocument();
    expect(screen.queryByText('acme/api')).not.toBeInTheDocument();
  });

  test('subscribes a repo to listed PRs, and saves changed numbers', async () => {
    const user = userEvent.setup();
    const fetchMock = respondWith({ ok: true, sources: SOURCES });
    global.fetch = fetchMock;
    renderSection();

    await user.type(screen.getByRole('combobox', { name: 'Subscribe to a repo' }), 'new/repo');
    await user.selectOptions(screen.getByRole('combobox', { name: 'What to follow' }), 'numbers');
    await user.type(screen.getByRole('textbox', { name: 'PR numbers to follow' }), '5, 6');
    await user.click(screen.getByRole('button', { name: 'Subscribe' }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/view-prs/subscriptions',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ repo: 'new/repo', mode: 'numbers', numbers: ['5', '6'] }) }),
    );

    const numbers = within(item('acme/web')).getByRole('textbox', { name: 'PR numbers to follow in acme/web' });
    await user.clear(numbers);
    await user.type(numbers, '4,8');
    await user.click(within(item('acme/web')).getByRole('button', { name: 'Save' }));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/view-prs/subscriptions',
      expect.objectContaining({ body: JSON.stringify({ repo: 'acme/web', mode: 'numbers', numbers: ['4', '8'] }) }),
    );
  });

  test('removes a PR added one by one, and shows why a change failed', async () => {
    const user = userEvent.setup();
    global.fetch = respondWith({ ok: false, error: 'disk full' }, 500);
    renderSection();

    await user.click(within(item('other/lib#9')).getByRole('button', { name: 'Remove' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('disk full');
    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/tracked-prs',
      expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ repo: 'other/lib', number: '9' }) }),
    );
  });

  test('before there are any sources, says so and still offers to subscribe', () => {
    renderSection(null);
    expect(screen.getByText(/No sources file yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subscribe' })).toBeInTheDocument();
  });

  test("picking listed PRs keeps the choice while the numbers are typed, and going back saves nothing", async () => {
    const user = userEvent.setup();
    const fetchMock = respondWith({ ok: true, sources: SOURCES });
    global.fetch = fetchMock;
    renderSection();
    const mode = within(item('acme/api')).getByRole('combobox');

    await user.selectOptions(mode, 'numbers');
    expect(mode).toHaveValue('numbers');
    expect(within(item('acme/api')).getByRole('textbox', { name: 'PR numbers to follow in acme/api' })).toBeInTheDocument();

    await user.selectOptions(mode, 'recent');
    expect(mode).toHaveValue('recent');
    expect(within(item('acme/api')).queryByRole('textbox')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    // A listed subscription switched to recent is saved.
    await user.selectOptions(within(item('acme/web')).getByRole('combobox'), 'recent');
    expect(fetchMock).toHaveBeenCalledWith(
      '/view-prs/subscriptions',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ repo: 'acme/web', mode: 'recent' }) }),
    );
  });

  test("lists VIEW_PRS_AUTO_REPOS's repos as fixed, without Unsubscribe", () => {
    renderSection({ ...SOURCES, envRepos: ['acme/api', 'env/only'] });

    expect(within(item('env/only')).getByText(/set by VIEW_PRS_AUTO_REPOS/)).toBeInTheDocument();
    expect(within(item('acme/api')).queryByRole('button', { name: 'Unsubscribe' })).not.toBeInTheDocument();
    expect(within(item('acme/web')).getByRole('button', { name: 'Unsubscribe' })).toBeInTheDocument();
  });

  test('says when the file was lost and started empty, and where an unreadable one was kept', () => {
    renderSection({
      subscriptions: [],
      trackedPrs: [],
      lost: { at: '2026-11-04T09:00:00Z', asidePath: '/data/check-open-pr-updates.sources.json.unreadable-1' },
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/was unreadable on .*, so it started empty/);
    expect(alert).toHaveTextContent('kept as /data/check-open-pr-updates.sources.json.unreadable-1');
  });
});
