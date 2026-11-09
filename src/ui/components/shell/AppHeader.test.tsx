/** @jest-environment jsdom */

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrDataProvider } from '../../state/PrDataProvider';
import { TabStateProvider } from '../TabStateProvider';
import { StatusTextProvider } from '../StatusTextProvider';
import { useStatusText } from '../../state/StatusTextContext';
import type { PrDataPayload } from '../../types/pr-data.ts';
import { AppHeader } from './AppHeader';
import { SettingsDrawerProvider, useOpenDrawer } from '../../state/SettingsDrawerContext';

let openDrawer: string | null = null;
function SettingsProbe() {
  openDrawer = useOpenDrawer();
  return null;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const loaded = (lastRun: PrDataPayload['lastRun']): PrDataPayload => ({ ok: true, byPrNumber: {}, lastRun });

const renderHeader = (payload: PrDataPayload = loaded({ repo: 'octocat/hello-world', updatedAt: minutesAgo(5) })) =>
  render(
    <PrDataProvider initialPayload={payload}>
      <TabStateProvider>
        <AppHeader />
      </TabStateProvider>
    </PrDataProvider>,
  );

describe('AppHeader', () => {
  test('names the app and the repo shown', () => {
    renderHeader();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'View PR Updates' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('octocat/hello-world');
  });

  test('links Home (the server it is mounted in) and the README', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'README' })).toHaveAttribute('href', './README.md');
  });

  test('with rows from several repos, says how many and lists them on hover', () => {
    renderHeader({
      ...loaded({ repo: 'o/a', updatedAt: minutesAgo(5) }),
      byPrNumber: { 1: { repo: 'o/a', prNumber: '1' }, 2: { repo: 'o/b', prNumber: '2' } },
    });
    const repos = screen.getByText('2 repos');
    expect(repos).toHaveAttribute('title', 'o/a, o/b');
    expect(screen.getByRole('banner')).not.toHaveTextContent('o/a');
  });

  describe('view tabs', () => {
    // The panels their aria-controls name (AppShell renders them, and shows
    // the selected one: AppShell.test.tsx).
    const panelIds = ['tab-panel-pr-data', 'tab-panel-review-stats', 'tab-panel-author-insights'];
    beforeEach(() => {
      panelIds.forEach((id) => {
        const panel = document.createElement('section');
        panel.id = id;
        document.body.appendChild(panel);
      });
    });
    afterEach(() => panelIds.forEach((id) => document.getElementById(id)?.remove()));

    test('Pull requests / Review stats / Authors, Pull requests first, each controlling its view', async () => {
      const user = userEvent.setup();
      renderHeader();
      const tabs = screen.getAllByRole('tab');
      expect(tabs.map((tab) => tab.textContent)).toEqual(['Pull requests', 'Review stats', 'Authors']);
      expect(screen.getByRole('tab', { name: 'Pull requests' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Pull requests' })).toHaveAttribute('id', 'tab-pr-data');
      expect(screen.getByRole('tab', { name: 'Pull requests' })).toHaveAttribute('aria-controls', 'tab-panel-pr-data');

      await user.click(screen.getByRole('tab', { name: 'Authors' }));
      expect(screen.getByRole('tab', { name: 'Authors' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('tab', { name: 'Pull requests' })).toHaveAttribute('aria-selected', 'false');
    });

    test('arrow keys move between them', async () => {
      const user = userEvent.setup();
      renderHeader();
      await user.click(screen.getByRole('tab', { name: 'Pull requests' }));
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('tab', { name: 'Review stats' })).toHaveFocus();
      expect(screen.getByRole('tab', { name: 'Review stats' })).toHaveAttribute('aria-selected', 'true');
      await user.keyboard('{ArrowLeft}{ArrowLeft}');
      expect(screen.getByRole('tab', { name: 'Authors' })).toHaveFocus();
    });
  });

  describe('last update', () => {
    test('says how long ago the data was updated, the exact time on hover', () => {
      renderHeader();
      const pill = screen.getByText('Updated 5m ago');
      expect(pill).toHaveAttribute('title', expect.stringMatching(/^Last updated /));
      expect(pill).not.toHaveAttribute('data-tone');
    });

    test('marks data a day or more old', () => {
      renderHeader(loaded({ updatedAt: minutesAgo(60 * 30) }));
      expect(screen.getByText('Updated 1d ago')).toHaveAttribute('data-tone', 'attention');
    });

    test("once the repos shown are checked, says when (the least recent), each repo and the last run on hover", () => {
      renderHeader({
        ...loaded({ repo: 'o/a', updatedAt: minutesAgo(30) }),
        byPrNumber: { 1: { repo: 'o/a', prNumber: '1' }, 2: { repo: 'o/b', prNumber: '2' } },
        dataMeta: {
          dataVersion: 'v1',
          liveSummary: {
            'o/a': { checkedAt: minutesAgo(1), quickCheckIntervalMs: 5 * 60_000 },
            'o/b': { checkedAt: minutesAgo(3), quickCheckIntervalMs: 5 * 60_000 },
          },
        },
      });
      const pill = screen.getByText('Checked 3m ago');
      expect(pill.getAttribute('title')?.split('\n')).toEqual([
        expect.stringMatching(/^o\/a: checked 1m ago/),
        expect.stringMatching(/^o\/b: checked 3m ago/),
        expect.stringMatching(/^Last run 30m ago/),
      ]);
      expect(pill).not.toHaveAttribute('data-tone');
    });

    test("marks a repo whose check is failing", () => {
      renderHeader({
        ...loaded({ repo: 'o/a', updatedAt: minutesAgo(30) }),
        byPrNumber: { 1: { repo: 'o/a', prNumber: '1' } },
        dataMeta: { liveSummary: { 'o/a': { checkedAt: minutesAgo(2), lastError: 'rate limited', lastErrorAt: minutesAgo(1) } } },
      });
      const pill = screen.getByText('Checked 2m ago');
      expect(pill).toHaveAttribute('data-tone', 'attention');
      expect(pill).toHaveAttribute('title', expect.stringContaining('failing (rate limited)'));
    });

    test('before the first load, and before any run', () => {
      const { unmount } = renderHeader({});
      expect(screen.getByText('Loading…')).toBeInTheDocument();
      unmount();
      renderHeader(loaded(null));
      expect(screen.getByText('Not updated yet')).toBeInTheDocument();
    });
  });

  test('shows the latest action status once something reports: its first line, all of it on hover', () => {
    let setStatusText: (text: string) => void = () => {};
    function StatusSetter() {
      setStatusText = useStatusText().setStatusText;
      return null;
    }
    render(
      <PrDataProvider initialPayload={loaded(null)}>
        <StatusTextProvider>
          <StatusSetter />
          <AppHeader />
        </StatusTextProvider>
      </PrDataProvider>,
    );
    const status = within(screen.getByRole('banner')).getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeEmptyDOMElement();

    act(() => setStatusText('Ack only completed\nPR #1: acked'));
    expect(status).toHaveTextContent(/^Ack only completed$/);
    expect(status).toHaveAttribute('title', 'Ack only completed\nPR #1: acked');
  });

  test.each([
    ['Tools', 'tools'],
    ['Settings', 'settings'],
  ])('%s opens its own drawer, and says it is open (the other button does not)', async (name, drawer) => {
    const user = userEvent.setup();
    render(
      <PrDataProvider initialPayload={loaded(null)}>
        <SettingsDrawerProvider>
          <AppHeader />
          <SettingsProbe />
        </SettingsDrawerProvider>
      </PrDataProvider>,
    );
    const button = screen.getByRole('button', { name });
    const other = screen.getByRole('button', { name: name === 'Tools' ? 'Settings' : 'Tools' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(openDrawer).toBe(drawer);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(other).toHaveAttribute('aria-expanded', 'false');
  });

  test('has no quick check of its own: those are in Tools › Run & check', () => {
    renderHeader();
    expect(within(screen.getByRole('banner')).queryByRole('button', { name: /quick check/i })).not.toBeInTheDocument();
  });
});
