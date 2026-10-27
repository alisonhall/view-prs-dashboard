/** @jest-environment jsdom */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrDataProvider } from '../../state/PrDataProvider';
import { SettingsDrawerProvider } from '../../state/SettingsDrawerContext';
import type { PrDataPayload } from '../../types/pr-data.ts';
import { TabStateProvider } from '../TabStateProvider';
import { AppShell } from './AppShell';

// The views' contents have their own tests; stand-ins here show where the
// shell puts them and when it mounts them.
const mockMounts: string[] = [];
// A function declaration: jest.mock factories run before the module body.
function mockStandIn(name: string) {
  return function StandIn() {
    mockMounts.push(name);
    return <div data-testid={name} />;
  };
}
jest.mock('../PrTableApp', () => ({ PrTableApp: mockStandIn('pr-table') }));
jest.mock('../filter-bar/DataViewHeader', () => ({ DataViewHeader: mockStandIn('data-view-header') }));
// Its form body needs the whole filter state; Quick check all has its own
// tests. The stand-in follows a test-owned store instead, standing in for a
// filter edit.
const mockFormStore = {
  version: 0,
  listeners: new Set<() => void>(),
  subscribe(listener: () => void) {
    mockFormStore.listeners.add(listener);
    return () => mockFormStore.listeners.delete(listener);
  },
  bump() {
    mockFormStore.version += 1;
    mockFormStore.listeners.forEach((listener) => listener());
  },
};
jest.mock('../../state/useQuickCheckActions', () => ({
  useQuickCheckActions: () => {
    jest.requireActual('react').useSyncExternalStore(mockFormStore.subscribe, () => mockFormStore.version);
    return { handleQuickCheckAll: async () => undefined };
  },
}));
jest.mock('../settings/SettingsDrawer', () => ({ SettingsDrawer: mockStandIn('settings-drawer') }));
jest.mock('../ReviewStatsControls', () => ({ ReviewStatsControls: mockStandIn('stats-controls') }));
jest.mock('../ReviewStatsContent', () => ({ ReviewStatsContent: mockStandIn('stats-content') }));
jest.mock('../AuthorInsightsSelector', () => ({ AuthorInsightsSelector: mockStandIn('author-selector') }));
jest.mock('../AuthorInsightsHeader', () => ({ AuthorInsightsHeader: mockStandIn('author-header') }));
jest.mock('../AuthorInsightsCommentsSection', () => ({ AuthorInsightsCommentsSection: mockStandIn('author-comments') }));
jest.mock('../AuthorInsightsNotesSection', () => ({ AuthorInsightsNotesSection: mockStandIn('author-notes') }));
jest.mock('../AuthorCreatedPrsSection', () => ({ AuthorCreatedPrsSection: mockStandIn('author-created-prs') }));

const loaded: PrDataPayload = { ok: true, byPrNumber: {}, lastRun: { repo: 'o/r', updatedAt: '2026-10-26T10:00:00Z' } };

const renderShell = () =>
  render(
    <PrDataProvider initialPayload={loaded}>
      <TabStateProvider>
        <SettingsDrawerProvider>
          <AppShell />
        </SettingsDrawerProvider>
      </TabStateProvider>
    </PrDataProvider>,
  );

// Each view's panel, found by the tab that labels it.
const panel = (tabName: string) => {
  const tab = screen.getByRole('tab', { name: tabName });
  const element = document.querySelector(`[role="tabpanel"][aria-labelledby="${tab.id}"]`);
  expect(element).not.toBeNull();
  return element;
};

beforeEach(() => {
  mockMounts.length = 0;
});

test('renders the page: the header, the three views labelled by their tabs, and the Settings drawer', () => {
  renderShell();
  expect(screen.getByRole('banner')).toBeInTheDocument();
  expect(panel('Pull requests')).toContainElement(document.getElementById('pr-sections'));
  expect(panel('Review stats')).toContainElement(document.getElementById('stats-content-root'));
  expect(panel('Authors')).toContainElement(document.getElementById('author-insights-content-root'));
  expect(screen.getByTestId('settings-drawer')).toBeInTheDocument();
});

test('shows the view whose tab is selected and hides the others', async () => {
  const user = userEvent.setup();
  renderShell();
  expect(panel('Pull requests')).toBeVisible();
  expect(panel('Review stats')).not.toBeVisible();
  expect(panel('Authors')).not.toBeVisible();

  await user.click(screen.getByRole('tab', { name: 'Authors' }));
  expect(panel('Authors')).toBeVisible();
  expect(panel('Pull requests')).not.toBeVisible();
  expect(panel('Review stats')).not.toBeVisible();
});

test('mounts Review stats and Authors the first time each is shown, and keeps them mounted after', async () => {
  const user = userEvent.setup();
  renderShell();
  expect(mockMounts).not.toContain('stats-content');
  expect(mockMounts).not.toContain('author-selector');

  await user.click(screen.getByRole('tab', { name: 'Review stats' }));
  expect(await screen.findByTestId('stats-controls')).toBeInTheDocument();
  expect(await screen.findByTestId('stats-content')).toBeInTheDocument();
  expect(mockMounts).not.toContain('author-selector');

  await user.click(screen.getByRole('tab', { name: 'Authors' }));
  for (const part of ['author-selector', 'author-header', 'author-comments', 'author-notes', 'author-created-prs']) {
    expect(await screen.findByTestId(part)).toBeInTheDocument();
  }
  // Still in the page (hidden), not unmounted.
  expect(screen.getByTestId('stats-content')).not.toBeVisible();

  await user.click(screen.getByRole('tab', { name: 'Review stats' }));
  expect(screen.getByTestId('author-selector')).not.toBeVisible();
  expect(screen.getByTestId('stats-content')).toBeVisible();
});

const renderCount = (name: string) => mockMounts.filter((mounted) => mounted === name).length;

test('switching tabs re-renders only the panels, not the table, the data header or the drawer', async () => {
  const user = userEvent.setup();
  renderShell();
  await user.click(screen.getByRole('tab', { name: 'Review stats' }));
  await screen.findByTestId('stats-content');
  const before = ['pr-table', 'data-view-header', 'settings-drawer', 'stats-content'].map(renderCount);

  await user.click(screen.getByRole('tab', { name: 'Pull requests' }));
  await user.click(screen.getByRole('tab', { name: 'Review stats' }));

  expect(['pr-table', 'data-view-header', 'settings-drawer', 'stats-content'].map(renderCount)).toEqual(before);
});

test('a change the Quick check action follows (a filter edit) re-renders the header, not the table', () => {
  renderShell();
  const before = ['pr-table', 'data-view-header', 'settings-drawer'].map(renderCount);
  // The header follows the store, so the bump does re-render something.
  expect(mockFormStore.listeners.size).toBeGreaterThan(0);
  act(() => mockFormStore.bump());
  expect(['pr-table', 'data-view-header', 'settings-drawer'].map(renderCount)).toEqual(before);
});

// The PR table waiting for the first data load is react-app.test.tsx's (it
// needs PrDataProvider's real load).
