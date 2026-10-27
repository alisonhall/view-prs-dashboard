/** @jest-environment jsdom */

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrDataProvider } from '../../state/PrDataProvider';
import { SettingsDrawerProvider } from '../../state/SettingsDrawerContext';
import type { PrDataPayload } from '../../types/pr-data.ts';
import { TabStateProvider } from '../TabStateProvider';
import { AppShell } from './AppShell';

// The views' contents have their own tests; stand-ins here show where the
// shell puts them and when it mounts them.
const mockMounts: string[] = [];
// Stand-ins named here throw when they render.
const mockFailing = new Set<string>();
// A function declaration: jest.mock factories run before the module body.
function mockStandIn(name: string) {
  return function StandIn() {
    if (mockFailing.has(name)) throw new Error(`${name} broke`);
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
  mockFailing.clear();
});

test('renders the page: the header, the three views labelled by their tabs, and the Settings drawer', async () => {
  const user = userEvent.setup();
  renderShell();
  expect(screen.getByRole('banner')).toBeInTheDocument();
  expect(panel('Pull requests')).toContainElement(document.getElementById('pr-sections'));
  expect(screen.getByTestId('settings-drawer')).toBeInTheDocument();
  // The lazy views are empty until first shown.
  expect(panel('Review stats')).toBeEmptyDOMElement();

  await user.click(screen.getByRole('tab', { name: 'Review stats' }));
  await user.click(screen.getByRole('tab', { name: 'Authors' }));
  expect(await screen.findByTestId('author-created-prs')).toBeInTheDocument();
  const stats = within(panel('Review stats') as HTMLElement);
  expect(stats.getByRole('group', { name: 'Review statistics controls', hidden: true })).toContainElement(screen.getByTestId('stats-controls'));
  expect(stats.getByRole('region', { name: 'Review statistics', hidden: true })).toContainElement(screen.getByTestId('stats-content'));
  const authors = within(panel('Authors') as HTMLElement);
  for (const [name, part] of [
    ['Selected author', 'author-header'],
    ['Author comments', 'author-comments'],
    ["Author's PR notes", 'author-notes'],
    ["Author's created PRs", 'author-created-prs'],
  ] as const) {
    expect(authors.getByRole('region', { name })).toContainElement(screen.getByTestId(part));
  }
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

test('a view that throws shows a notice in its place; the header and the other views carry on', async () => {
  const user = userEvent.setup();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockFailing.add('stats-content');
  renderShell();

  await user.click(screen.getByRole('tab', { name: 'Review stats' }));
  const notice = await within(panel('Review stats') as HTMLElement).findByRole('alert');
  expect(notice).toHaveTextContent("This view couldn't be shown.");
  expect(notice).toHaveTextContent('stats-content broke');
  expect(within(notice).getByRole('button', { name: 'Reload' })).toBeInTheDocument();

  await user.click(screen.getByRole('tab', { name: 'Pull requests' }));
  expect(panel('Pull requests')).toBeVisible();
  expect(within(panel('Pull requests') as HTMLElement).queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('banner')).toBeInTheDocument();
  jest.mocked(console.error).mockRestore();
});

// The PR table waiting for the first data load is react-app.test.tsx's (it
// needs PrDataProvider's real load).
