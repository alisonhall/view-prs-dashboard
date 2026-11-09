/** @jest-environment jsdom */

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { PrDataContext, type PrDataValue } from '../../state/PrDataContext';
import { SettingsDrawerContext, type SettingsDrawerValue } from '../../state/SettingsDrawerContext';
import type { PrSources } from '../../types/pr-data.ts';
import { BackgroundUpdatesSection, SAVE_DELAY_MS } from './BackgroundUpdatesSection';

// Stand-ins for the server: GET /view-prs/dispatcher/settings answers
// `settings`; /view-prs/user-defaults GET returns `saved` (a 500 unless
// `savedOk`), PUT replaces it.
let saved: Record<string, unknown>;
let savedOk: boolean;
let settings: unknown;
let settingsOk: boolean;
// While set, GET /view-prs/dispatcher/settings waits for it before
// answering - with `settings` as it was when asked, as a server would.
// `settingsGates`, when not empty, gives each request the next one instead.
let settingsGate: Promise<void> | null = null;
let settingsGates: Array<Promise<void>> = [];
const gate = () => {
  let open = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
};
const puts: Array<Record<string, unknown>> = [];
const fetchMock = jest.fn(async (input: string, init?: RequestInit) => {
  if (input.includes('/dispatcher/settings')) {
    const answer = settingsOk ? settings : { ok: false, error: 'Boom' };
    const ok = settingsOk;
    const wait = settingsGates.shift() ?? settingsGate;
    if (wait) await wait;
    return { ok, status: ok ? 200 : 500, json: async () => answer };
  }
  if (init?.method === 'PUT') {
    saved = JSON.parse(String(init.body));
    puts.push(saved);
    return { ok: true, json: async () => ({}) };
  }
  if (!savedOk) return { ok: false, status: 500, json: async () => ({}) };
  const overrides = { ...saved };
  return { ok: true, json: async () => ({ overrides }) };
});

const DEFAULTS = {
  ok: true,
  repos: ['acme/api', 'acme/web'],
  taskTypes: [
    { taskType: 'quickCheck', intervalMs: 5 * 60000, priority: 5 },
    { taskType: 'autoRefresh', intervalMs: 15 * 60000, priority: 3 },
    { taskType: 'mergedDrain', intervalMs: 30 * 60000, priority: 1 },
  ],
};

// The section with the data's sources (Settings › Sources) and, when
// given, a drawer asking for a repo (Sources' "Timing…").
const withSources = (sources: PrSources | null, drawer?: Partial<SettingsDrawerValue>, children: ReactNode = <BackgroundUpdatesSection />) => {
  const tree = <PrDataContext.Provider value={{ payload: { ok: true, byPrNumber: {}, dataMeta: { sources } } } as unknown as PrDataValue}>{children}</PrDataContext.Provider>;
  return drawer ? <SettingsDrawerContext.Provider value={drawer as SettingsDrawerValue}>{tree}</SettingsDrawerContext.Provider> : tree;
};
const settingsCalls = () => fetchMock.mock.calls.filter(([input]) => String(input).includes('/dispatcher/settings')).length;

const repoGroup = (repo: string) => screen.getByRole('group', { name: new RegExp(`^${repo}`) });
const field = (repo: string, name: string) => within(repoGroup(repo)).getByRole('textbox', { name });

describe('Settings › Background updates', () => {
  beforeEach(() => {
    saved = { repo: 'acme/api' };
    savedOk = true;
    settings = DEFAULTS;
    settingsOk = true;
    settingsGate = null;
    settingsGates = [];
    puts.length = 0;
    (global as unknown as { fetch: unknown }).fetch = fetchMock;
  });

  afterEach(() => {
    fetchMock.mockClear();
  });

  test('lists each scheduled repo with empty fields showing the defaults', async () => {
    render(<BackgroundUpdatesSection />);
    await screen.findByRole('group', { name: /^acme\/api/ });
    expect(screen.getAllByRole('group').map((group) => group.querySelector('legend')?.textContent)).toEqual(['acme/api', 'acme/web']);

    expect(field('acme/api', 'Priority boost')).toHaveValue('');
    expect(field('acme/api', 'Priority boost')).toHaveAttribute('placeholder', '0');
    expect(field('acme/api', 'Quick check every')).toHaveAttribute('placeholder', '5');
    expect(field('acme/api', 'Full refresh every')).toHaveAttribute('placeholder', '15');
    expect(field('acme/api', 'Merged/closed drain every')).toHaveAttribute('placeholder', '30');
    expect(within(repoGroup('acme/api')).getByText(/Priorities: Quick check 5, Full refresh 3, Merged\/closed drain 1/)).toBeInTheDocument();
    expect(within(repoGroup('acme/api')).getByRole('button', { name: 'Restore defaults for acme/api' })).toBeDisabled();
  });

  test('shows saved settings, and a saved repo no longer scheduled', async () => {
    saved = {
      schedulerRepoConfig: {
        'acme/web': { priority: 2, quickCheckIntervalMs: 90000 },
        'acme/old': { autoRefreshIntervalMs: 600000 },
      },
    };
    render(<BackgroundUpdatesSection />);
    await waitFor(() => expect(field('acme/web', 'Priority boost')).toHaveValue('2'));
    expect(field('acme/web', 'Quick check every')).toHaveValue('1.5');
    expect(within(repoGroup('acme/web')).getByText(/Priorities with the boost: Quick check 7, Full refresh 5, Merged\/closed drain 3/)).toBeInTheDocument();
    expect(repoGroup('acme/old')).toHaveAccessibleDescription('Not checked now; its saved settings wait.');
    expect(field('acme/old', 'Full refresh every')).toHaveValue('10');
  });

  test('a valid change is saved on leaving the field, in milliseconds, keeping the other settings', async () => {
    const user = userEvent.setup();
    render(<BackgroundUpdatesSection />);
    const quickCheck = await screen.findAllByRole('textbox', { name: 'Quick check every' });

    await user.type(quickCheck[0] as HTMLElement, '2');
    await user.type(field('acme/api', 'Priority boost'), '-1');
    await user.tab();

    await waitFor(() =>
      expect(saved).toEqual({
        repo: 'acme/api',
        schedulerRepoConfig: { 'acme/api': { quickCheckIntervalMs: 120000, priority: -1 } },
      }),
    );
    expect(within(repoGroup('acme/api')).getByText(/Quick check 4, Full refresh 2, Merged\/closed drain 0/)).toBeInTheDocument();
  });

  describe('while typing', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    const typing = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    test('a change is saved once typing pauses, not a keystroke at a time', async () => {
      const user = typing();
      render(<BackgroundUpdatesSection />);
      await screen.findByRole('group', { name: /^acme\/api/ });

      // "1" on the way to "15" would be a 1-minute auto refresh.
      await user.type(field('acme/api', 'Full refresh every'), '15');
      await act(() => jest.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1));
      expect(puts).toEqual([]);

      await act(() => jest.advanceTimersByTimeAsync(1));
      await waitFor(() => expect(saved).toEqual({ repo: 'acme/api', schedulerRepoConfig: { 'acme/api': { autoRefreshIntervalMs: 900000 } } }));
      expect(puts).toHaveLength(1);
    });

    test('an invalid value cancels an earlier valid one still waiting', async () => {
      const user = typing();
      render(<BackgroundUpdatesSection />);
      await screen.findByRole('group', { name: /^acme\/api/ });

      await user.type(field('acme/api', 'Quick check every'), '2x');
      await act(() => jest.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2));
      expect(field('acme/api', 'Quick check every')).toHaveAttribute('aria-invalid', 'true');
      expect(puts).toEqual([]);
    });

    test('closing mid-typing still saves what was typed', async () => {
      const user = typing();
      const { unmount } = render(<BackgroundUpdatesSection />);
      await screen.findByRole('group', { name: /^acme\/api/ });

      await user.type(field('acme/web', 'Priority boost'), '4');
      unmount();
      await waitFor(() => expect(saved).toEqual({ repo: 'acme/api', schedulerRepoConfig: { 'acme/web': { priority: 4 } } }));
    });
  });

  test('an invalid value is flagged and not saved; clearing a field goes back to the default', async () => {
    const user = userEvent.setup();
    saved = { schedulerRepoConfig: { 'acme/api': { quickCheckIntervalMs: 120000 } } };
    render(<BackgroundUpdatesSection />);
    await waitFor(() => expect(field('acme/api', 'Quick check every')).toHaveValue('2'));

    await user.clear(field('acme/api', 'Quick check every'));
    await user.tab();
    // Clearing saved the default (no settings left).
    await waitFor(() => expect(saved).toEqual({}));

    await user.type(field('acme/api', 'Quick check every'), '0.2');
    expect(field('acme/api', 'Quick check every')).toHaveAttribute('aria-invalid', 'true');
    expect(field('acme/api', 'Quick check every')).toHaveAccessibleDescription('At least 1 minute.');

    // Leaving it invalid keeps what's typed, to fix, and saves nothing.
    await user.tab();
    expect(field('acme/api', 'Quick check every')).toHaveValue('0.2');
    expect(puts).toHaveLength(1);
  });

  test('a saved value outside the form’s range is shown as applying, not as an error', async () => {
    saved = { schedulerRepoConfig: { 'acme/api': { priority: 25, quickCheckIntervalMs: 30000 } } };
    render(<BackgroundUpdatesSection />);
    await waitFor(() => expect(field('acme/api', 'Priority boost')).toHaveValue('25'));

    for (const name of ['Priority boost', 'Quick check every']) {
      expect(field('acme/api', name)).not.toHaveAttribute('aria-invalid');
      expect(field('acme/api', name)).toHaveAccessibleDescription("Saved outside this form's range; it still applies.");
    }
    expect(field('acme/api', 'Quick check every')).toHaveValue('0.5');
    expect(within(repoGroup('acme/api')).getByText(/Quick check 30, Full refresh 28, Merged\/closed drain 26/)).toBeInTheDocument();
  });

  test('repos whose names differ only in punctuation get their own fields', async () => {
    settings = { ...DEFAULTS, repos: ['a/b-c', 'a-b/c'] };
    render(<BackgroundUpdatesSection />);
    await screen.findByRole('group', { name: /^a\/b-c/ });

    const first = field('a/b-c', 'Priority boost');
    const second = field('a-b/c', 'Priority boost');
    expect(first).not.toBe(second);
    expect(first.id).not.toEqual(second.id);
  });

  test('Restore defaults removes the repo’s settings and keeps the others', async () => {
    const user = userEvent.setup();
    saved = { repo: 'acme/api', schedulerRepoConfig: { 'acme/api': { priority: 3 }, 'acme/web': { priority: 1 } } };
    render(<BackgroundUpdatesSection />);
    await waitFor(() => expect(field('acme/api', 'Priority boost')).toHaveValue('3'));

    await user.click(screen.getByRole('button', { name: 'Restore defaults for acme/api' }));

    expect(field('acme/api', 'Priority boost')).toHaveValue('');
    await waitFor(() => expect(saved).toEqual({ repo: 'acme/api', schedulerRepoConfig: { 'acme/web': { priority: 1 } } }));
  });

  test('says so when the defaults can’t be loaded', async () => {
    settingsOk = false;
    render(<BackgroundUpdatesSection />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the background update settings: Boom");
  });

  test('says so when the saved settings can’t be read, rather than show them as cleared', async () => {
    savedOk = false;
    render(<BackgroundUpdatesSection />);
    expect(await screen.findByRole('alert')).toHaveTextContent("the saved settings couldn't be read");
  });

  test("lists every repo in the sources first, saying how it's followed, and why one isn't checked", async () => {
    settings = { ...DEFAULTS, repos: ['acme/api', 'other/lib', 'acme/fallback'] };
    saved = { schedulerRepoConfig: { 'acme/old': { priority: 1 } } };
    render(
      withSources({
        subscriptions: [{ repo: 'acme/api', mode: 'recent' }],
        trackedPrs: [
          { repo: 'other/lib', number: '4' },
          { repo: 'acme/done', number: '9' },
        ],
      }),
    );
    await screen.findByRole('group', { name: /^acme\/api/ });
    expect(screen.getAllByRole('group').map((group) => group.querySelector('legend')?.textContent)).toEqual([
      'acme/api',
      'other/lib',
      'acme/done',
      'acme/fallback',
      'acme/old',
    ]);
    expect(repoGroup('acme/api')).toHaveAccessibleDescription('From your sources: its recent PRs.');
    expect(repoGroup('other/lib')).toHaveAccessibleDescription('From your sources: 1 PR added one by one.');
    // In the sources, but the server doesn't check it.
    expect(repoGroup('acme/done')).toHaveAccessibleDescription(
      'From your sources: 1 PR added one by one. Not checked now: the PRs it follows by number were all merged or closed over 30 days ago.',
    );
    expect(field('acme/done', 'Priority boost')).toBeEnabled();
    expect(repoGroup('acme/fallback')).not.toHaveAccessibleDescription(/./);
    expect(repoGroup('acme/old')).toHaveAccessibleDescription('Not in your sources, so not checked; its saved settings wait.');
  });

  test('asks the server again which repos it checks when the sources change, not otherwise', async () => {
    const before: PrSources = { subscriptions: [{ repo: 'acme/api', mode: 'recent' }], trackedPrs: [] };
    const { rerender } = render(withSources(before));
    await screen.findByRole('group', { name: /^acme\/api/ });
    expect(settingsCalls()).toBe(1);

    rerender(withSources({ ...before }));
    expect(settingsCalls()).toBe(1);

    settings = { ...DEFAULTS, repos: ['acme/api', 'acme/new'] };
    rerender(withSources({ ...before, subscriptions: [...before.subscriptions, { repo: 'acme/new', mode: 'recent' }] }));
    await waitFor(() => expect(settingsCalls()).toBe(2));
    await waitFor(() => expect(repoGroup('acme/new')).toHaveAccessibleDescription('From your sources: its recent PRs.'));
  });

  test("says nothing about which repos are checked until the server's answer is about the sources shown", async () => {
    const before: PrSources = { subscriptions: [{ repo: 'acme/api', mode: 'recent' }], trackedPrs: [] };
    const { rerender } = render(withSources(before));
    await screen.findByRole('group', { name: /^acme\/api/ });

    let open = () => {};
    settingsGate = new Promise((resolve) => {
      open = resolve;
    });
    settings = { ...DEFAULTS, repos: ['acme/api', 'acme/new'] };
    rerender(withSources({ ...before, subscriptions: [...before.subscriptions, { repo: 'acme/new', mode: 'recent' }] }));
    // Listed at once, from the sources - not yet called unchecked.
    expect(repoGroup('acme/new')).toHaveAccessibleDescription('From your sources: its recent PRs.');
    await act(async () => open());
    expect(repoGroup('acme/new')).toHaveAccessibleDescription('From your sources: its recent PRs.');
  });

  test('a change of sources while the first answer is on its way: the later question\'s answer is the one kept, whichever comes last', async () => {
    const first = gate();
    const second = gate();
    settingsGates = [first.promise, second.promise];
    const before: PrSources = { subscriptions: [{ repo: 'acme/api', mode: 'recent' }], trackedPrs: [{ repo: 'acme/done', number: '1' }] };
    // The first question is asked before acme/new is subscribed to...
    settings = { ...DEFAULTS, repos: ['acme/api'] };
    const { rerender } = render(withSources(before));
    // ...the second after.
    settings = { ...DEFAULTS, repos: ['acme/api', 'acme/new'] };
    rerender(withSources({ ...before, subscriptions: [...before.subscriptions, { repo: 'acme/new', mode: 'recent' }] }));
    // The second answer arrives first; the first, out of date, after it.
    await act(async () => second.open());
    await act(async () => first.open());
    await screen.findByRole('group', { name: /^acme\/new/ });
    expect(repoGroup('acme/new')).toHaveAccessibleDescription('From your sources: its recent PRs.');
    expect(repoGroup('acme/done')).toHaveAccessibleDescription(/Not checked now/);
  });

  describe("opened at a repo (Sources' Timing…)", () => {
    const original = Element.prototype.scrollIntoView;
    let scrollIntoView: jest.Mock;
    beforeEach(() => {
      scrollIntoView = jest.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
    });
    afterEach(() => {
      Element.prototype.scrollIntoView = original;
    });

    test("it scrolls to the repo and focuses its first field, once", async () => {
      const focus = { backgroundUpdatesFocus: { repo: 'acme/web', requestedAt: 1 } };
      const { rerender } = render(withSources(null, focus));
      await waitFor(() => expect(field('acme/web', 'Priority boost')).toHaveFocus());
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      rerender(withSources(null, { ...focus }));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    });

    test('a repo just added to the sources is focused once the data lists it', async () => {
      const before: PrSources = { subscriptions: [{ repo: 'acme/api', mode: 'recent' }], trackedPrs: [] };
      const focus = { backgroundUpdatesFocus: { repo: 'acme/new', requestedAt: 1 } };
      const { rerender } = render(withSources(before, focus));
      await screen.findByRole('group', { name: /^acme\/api/ });
      expect(scrollIntoView).not.toHaveBeenCalled();

      rerender(withSources({ ...before, subscriptions: [...before.subscriptions, { repo: 'acme/new', mode: 'recent' }] }, focus));
      await waitFor(() => expect(field('acme/new', 'Priority boost')).toHaveFocus());
    });
  });

  test('says so when no repo is checked in the background', async () => {
    settings = { ...DEFAULTS, repos: [] };
    render(<BackgroundUpdatesSection />);
    expect(await screen.findByText('No repos are checked in the background yet.')).toBeInTheDocument();
  });
});
