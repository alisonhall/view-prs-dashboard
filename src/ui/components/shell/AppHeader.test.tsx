/** @jest-environment jsdom */

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrDataProvider } from '../../state/PrDataProvider';
import { TabStateProvider } from '../TabStateProvider';
import { StatusTextProvider } from '../StatusTextProvider';
import { useStatusText } from '../../state/StatusTextContext';
import type { PrDataPayload } from '../../types/pr-data.ts';
import { AppHeader, type AppHeaderProps } from './AppHeader';
import { SettingsDrawerProvider, useSettingsDrawer } from '../../state/SettingsDrawerContext';

let settingsOpen = false;
function SettingsProbe() {
  settingsOpen = useSettingsDrawer().isOpen;
  return null;
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const loaded = (lastRun: PrDataPayload['lastRun']): PrDataPayload => ({ ok: true, byPrNumber: {}, lastRun });

const renderHeader = (payload: PrDataPayload = loaded({ repo: 'octocat/hello-world', updatedAt: minutesAgo(5) }), props: Partial<AppHeaderProps> = {}) =>
  render(
    <PrDataProvider initialPayload={payload}>
      <TabStateProvider>
        <AppHeader onQuickCheckAll={async () => undefined} {...props} />
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
          <AppHeader onQuickCheckAll={async () => undefined} />
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

  test('Settings opens the Settings drawer', async () => {
    const user = userEvent.setup();
    render(
      <PrDataProvider initialPayload={loaded(null)}>
        <SettingsDrawerProvider>
          <AppHeader onQuickCheckAll={async () => undefined} />
          <SettingsProbe />
        </SettingsDrawerProvider>
      </PrDataProvider>,
    );
    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(settings).toHaveAttribute('aria-haspopup', 'dialog');
    expect(settings).toHaveAttribute('aria-expanded', 'false');
    await user.click(settings);
    expect(settingsOpen).toBe(true);
    expect(settings).toHaveAttribute('aria-expanded', 'true');
  });

  test('Quick check all runs the check and shows what it found', async () => {
    const user = userEvent.setup();
    const onQuickCheckAll = jest.fn(async () => ({ label: '2 updates found' }));
    renderHeader(undefined, { onQuickCheckAll });
    await user.click(screen.getByRole('button', { name: 'Quick check all' }));
    expect(onQuickCheckAll).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: '2 updates found' })).toBeInTheDocument();
  });
});
