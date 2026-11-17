/** @jest-environment jsdom */

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsDrawerProvider, useSettingsDrawer, type SettingsSectionId } from '../../state/SettingsDrawerContext';
import { SETTINGS_NAV_ROW_QUERY, SettingsDrawer } from './SettingsDrawer';
import { ToolsDrawer } from './ToolsDrawer';

// The sections need the whole app's Providers; the integration suite
// covers them in the real tree.
jest.mock('./RunCheckSection', () => ({
  RunCheckSection: () => (
    <>
      <button type="button">Run script</button>
      <input aria-label="Repo (owner/name)" />
    </>
  ),
}));
jest.mock('./SourcesSection', () => ({ SourcesSection: () => <p>Sources content</p> }));
jest.mock('./AppearanceSection', () => ({ AppearanceSection: () => <p>Appearance content</p> }));
jest.mock('./AttentionRulesSection', () => ({ AttentionRulesSection: () => <p>Attention rules content</p> }));
jest.mock('./MergeCommitsSection', () => ({ MergeCommitsSection: () => <p>Merge commits content</p> }));
jest.mock('./ChangeDetectionSection', () => ({ ChangeDetectionSection: () => <p>Change detection content</p> }));
jest.mock('./BackfillSection', () => ({ BackfillSection: () => <p>Backfill content</p> }));
jest.mock('./BackgroundUpdatesSection', () => ({ BackgroundUpdatesSection: () => <p>Background updates content</p> }));
jest.mock('./ActionLogSection', () => ({ ActionLogSection: () => <p>Action log content</p> }));
jest.mock('./PeopleSection', () => ({ PeopleSection: () => <p>People content</p> }));
jest.mock('./LocalClonesSection', () => ({ LocalClonesSection: () => <p>Local clones content</p> }));
jest.mock('./ExportSection', () => ({ ExportSection: () => <p>Export content</p> }));

let drawer: ReturnType<typeof useSettingsDrawer>;
function Openers() {
  drawer = useSettingsDrawer();
  return (
    <>
      <button type="button" onClick={() => drawer.open('tools')}>
        Tools
      </button>
      <button type="button" onClick={() => drawer.open('settings')}>
        Settings
      </button>
    </>
  );
}

const renderDrawers = (initialOpen = false, initialSection: SettingsSectionId = 'sources') =>
  render(
    <SettingsDrawerProvider initialOpen={initialOpen} initialSection={initialSection}>
      <Openers />
      <ToolsDrawer />
      <SettingsDrawer />
    </SettingsDrawerProvider>,
  );

const settingsDialog = () => screen.getByRole('dialog', { name: 'Settings' });
const toolsDialog = () => screen.getByRole('dialog', { name: 'Tools' });
const tabNames = (dialog: HTMLElement) => within(dialog).getAllByRole('tab').map((tab) => tab.textContent);

describe('SettingsDrawer and ToolsDrawer', () => {
  test('both are closed until opened; open, each is a modal dialog named for itself, focused, alone', async () => {
    const user = userEvent.setup();
    renderDrawers();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(settingsDialog()).toHaveAttribute('aria-modal', 'true');
    expect(settingsDialog()).toHaveFocus();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Tools' }));
    expect(toolsDialog()).toHaveFocus();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  test('Settings: its sections in order, under what they are for; it opens at the first', async () => {
    const user = userEvent.setup();
    renderDrawers(false, 'run');
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(tabNames(settingsDialog())).toEqual([
      'Sources',
      'Background updates',
      'Local clones',
      'Attention rules',
      'Change detection',
      'Merge commits',
      'People',
      'Appearance',
    ]);
    expect(within(settingsDialog()).getByRole('tab', { name: 'Sources' })).toHaveAttribute('aria-selected', 'true');
    // The group headings are seen, not read: a tab list holds only tabs.
    const headings = Array.from(settingsDialog().querySelectorAll('.ui-tab-group'));
    expect(headings.map((heading) => heading.textContent)).toEqual(['PRs followed', 'Rules', 'Display']);
    expect(headings.every((heading) => heading.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  test('Tools: Run & check (with the script options), Backfill, Export and the Action log', async () => {
    const user = userEvent.setup();
    renderDrawers();
    await user.click(screen.getByRole('button', { name: 'Tools' }));
    expect(tabNames(toolsDialog())).toEqual(['Run & check', 'Backfill', 'Export', 'Action log']);
    expect(within(toolsDialog()).getByRole('tabpanel', { name: 'Run & check' })).toContainElement(
      screen.getByRole('button', { name: 'Run script' }),
    );
    expect(toolsDialog().querySelector('.ui-tab-group')).toBeNull();
  });

  test('each drawer opens again at its own last section', async () => {
    const user = userEvent.setup();
    renderDrawers();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(within(settingsDialog()).getByRole('tab', { name: 'Appearance' }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Tools' }));
    await user.click(within(toolsDialog()).getByRole('tab', { name: 'Export' }));
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(within(settingsDialog()).getByRole('tab', { name: 'Appearance' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Tools' }));
    expect(within(toolsDialog()).getByRole('tab', { name: 'Export' })).toHaveAttribute('aria-selected', 'true');
  });

  test('opened at a section, the drawer it is in opens there', () => {
    renderDrawers();
    act(() => drawer.open('action-log'));
    expect(within(toolsDialog()).getByRole('tab', { name: 'Action log' })).toHaveAttribute('aria-selected', 'true');
    act(() => drawer.open('appearance'));
    expect(screen.queryByRole('dialog', { name: 'Tools' })).not.toBeInTheDocument();
    expect(within(settingsDialog()).getByRole('tab', { name: 'Appearance' })).toHaveAttribute('aria-selected', 'true');
  });

  test('↑/↓ move between sections, past the group headings', async () => {
    const user = userEvent.setup();
    renderDrawers(true, 'local-clones');
    await user.click(screen.getByRole('tab', { name: 'Local clones' }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('tab', { name: 'Attention rules' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Attention rules' })).toHaveAttribute('aria-selected', 'true');
  });

  test('in a narrow window the sections are a row, moving with ←/→', async () => {
    const user = userEvent.setup();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === SETTINGS_NAV_ROW_QUERY,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      renderDrawers(true);
      expect(screen.getByRole('tablist', { name: 'Settings sections' })).toHaveAttribute('aria-orientation', 'horizontal');
      await user.click(screen.getByRole('tab', { name: 'Sources' }));
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('tab', { name: 'Background updates' })).toHaveFocus();
    } finally {
      window.matchMedia = original;
    }
  });

  test('every section stays in the page while hidden (fields keep their ids)', () => {
    renderDrawers(false);
    expect(screen.getByRole('button', { name: 'Run script', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Repo (owner/name)', hidden: true })).toBeInTheDocument();
    expect(screen.getByText('Sources content')).toBeInTheDocument();
  });

  test('Esc, the close button or the backdrop closes it, and focus goes back to what opened it', async () => {
    const user = userEvent.setup();
    renderDrawers();
    const opener = screen.getByRole('button', { name: 'Tools' });

    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Close tools' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(opener);
    const backdrop = toolsDialog().parentElement?.querySelector('.settings-backdrop') as HTMLElement;
    await user.click(backdrop);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('Backfill is mounted from the start; Background updates, Action log, People and Export once first opened, then they stay', async () => {
    renderDrawers(false);
    expect(screen.getByText('Backfill content')).toBeInTheDocument();
    expect(screen.queryByText('Background updates content')).not.toBeInTheDocument();
    expect(screen.queryByText('Action log content')).not.toBeInTheDocument();
    expect(screen.queryByText('People content')).not.toBeInTheDocument();
    expect(screen.queryByText('Export content')).not.toBeInTheDocument();

    // Chosen while closed isn't opened.
    act(() => drawer.setSection('action-log'));
    expect(screen.queryByText('Action log content')).not.toBeInTheDocument();

    act(() => drawer.open('action-log'));
    expect(await screen.findByText('Action log content')).toBeVisible();
    act(() => drawer.open('export'));
    expect(await screen.findByText('Export content')).toBeVisible();
    act(() => drawer.open('background-updates'));
    expect(await screen.findByText('Background updates content')).toBeVisible();
    act(() => drawer.close());
    expect(screen.getByText('Background updates content')).toBeInTheDocument();
    expect(screen.getByText('Action log content')).toBeInTheDocument();
    expect(screen.getByText('Export content')).toBeInTheDocument();
    expect(screen.queryByText('People content')).not.toBeInTheDocument();
  });
});
