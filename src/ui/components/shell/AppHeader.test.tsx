/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrDataProvider } from '../../state/PrDataProvider';
import { TabStateProvider } from '../TabStateProvider';
import { TabPanelVisibilitySync } from '../TabPanelVisibilitySync';
import type { PrDataPayload } from '../../types/pr-data.ts';
import { AppHeader, type AppHeaderProps } from './AppHeader';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const loaded = (lastRun: PrDataPayload['lastRun']): PrDataPayload => ({ ok: true, byPrNumber: {}, lastRun });

const renderHeader = (payload: PrDataPayload = loaded({ repo: 'octocat/hello-world', updatedAt: minutesAgo(5) }), props: Partial<AppHeaderProps> = {}) =>
  render(
    <PrDataProvider initialPayload={payload}>
      <TabStateProvider>
        <TabPanelVisibilitySync />
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
      expect(document.getElementById('tab-panel-author-insights')?.hidden).toBe(false);
      expect(document.getElementById('tab-panel-pr-data')?.hidden).toBe(true);
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

  test('Quick check all runs the check and shows what it found', async () => {
    const user = userEvent.setup();
    const onQuickCheckAll = jest.fn(async () => ({ label: '2 updates found' }));
    renderHeader(undefined, { onQuickCheckAll });
    await user.click(screen.getByRole('button', { name: 'Quick check all' }));
    expect(onQuickCheckAll).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: '2 updates found' })).toBeInTheDocument();
  });
});
