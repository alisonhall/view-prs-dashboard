/** @jest-environment jsdom */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsDrawerProvider, useSettingsDrawer, type SettingsSectionId } from '../../state/SettingsDrawerContext';
import { SETTINGS_NAV_ROW_QUERY, SettingsDrawer } from './SettingsDrawer';

// The sections need the whole app's Providers; the integration suite
// covers them in the real tree.
jest.mock('./RunCheckSection', () => ({ RunCheckSection: () => <button type="button">Run script</button> }));
jest.mock('./ScriptOptionsSection', () => ({ ScriptOptionsSection: () => <input aria-label="Repo (owner/name)" /> }));
jest.mock('./AttentionRulesSection', () => ({ AttentionRulesSection: () => <p>Attention rules content</p> }));
jest.mock('./MergeCommitsSection', () => ({ MergeCommitsSection: () => <p>Merge commits content</p> }));
jest.mock('./ChangeDetectionSection', () => ({ ChangeDetectionSection: () => <p>Change detection content</p> }));
jest.mock('./BackfillSection', () => ({ BackfillSection: () => <p>Backfill content</p> }));
jest.mock('./ActionLogSection', () => ({ ActionLogSection: () => <p>Action log content</p> }));
jest.mock('./ActorNamesSection', () => ({ ActorNamesSection: () => <p>Actor names content</p> }));
jest.mock('./ExportSection', () => ({ ExportSection: () => <p>Export content</p> }));

let drawer: ReturnType<typeof useSettingsDrawer>;
function Opener() {
  drawer = useSettingsDrawer();
  return (
    <button type="button" onClick={() => drawer.open()}>
      Settings
    </button>
  );
}

const renderDrawer = (initialOpen = false, initialSection: SettingsSectionId = 'run') =>
  render(
    <SettingsDrawerProvider initialOpen={initialOpen} initialSection={initialSection}>
      <Opener />
      <SettingsDrawer />
    </SettingsDrawerProvider>,
  );

const dialog = () => screen.getByRole('dialog', { name: 'Settings' });

describe('SettingsDrawer', () => {
  test('is closed until opened; open, it is a modal dialog named Settings, focused', async () => {
    const user = userEvent.setup();
    renderDrawer();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    expect(dialog()).toHaveFocus();
  });

  test('its sections are a vertical tab list; the chosen one shows', async () => {
    const user = userEvent.setup();
    renderDrawer(true);
    const nav = screen.getByRole('tablist', { name: 'Settings sections' });
    expect(nav).toHaveAttribute('aria-orientation', 'vertical');
    expect(screen.getByRole('tab', { name: 'Run & check' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Run & check' })).toContainElement(screen.getByRole('button', { name: 'Run script' }));
    expect(screen.queryByRole('textbox', { name: 'Repo (owner/name)' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Script options' }));
    expect(screen.getByRole('tabpanel', { name: 'Script options' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Repo (owner/name)' })).toBeInTheDocument();
  });

  test('↑/↓ move between sections', async () => {
    const user = userEvent.setup();
    renderDrawer(true);
    await user.click(screen.getByRole('tab', { name: 'Run & check' }));
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
      renderDrawer(true);
      expect(screen.getByRole('tablist', { name: 'Settings sections' })).toHaveAttribute('aria-orientation', 'horizontal');
      await user.click(screen.getByRole('tab', { name: 'Run & check' }));
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('tab', { name: 'Attention rules' })).toHaveFocus();
    } finally {
      window.matchMedia = original;
    }
  });

  test('every section stays in the page while hidden (fields keep their ids)', () => {
    renderDrawer(false);
    expect(screen.getByRole('button', { name: 'Run script', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Repo (owner/name)', hidden: true })).toBeInTheDocument();
  });

  test('Esc, the close button or the backdrop closes it, and focus goes back to what opened it', async () => {
    const user = userEvent.setup();
    const { container } = renderDrawer();
    const opener = screen.getByRole('button', { name: 'Settings' });

    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(opener);
    await user.click(container.querySelector('.settings-backdrop') as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('the sections, in order', () => {
    renderDrawer(true);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Run & check',
      'Attention rules',
      'Merge commits',
      'Change detection',
      'Script options',
      'Backfill',
      'Action log',
      'Actor names',
      'Export',
      'Appearance',
    ]);
  });

  test('Backfill is mounted from the start; Action log, Actor names and Export once first opened, then they stay', async () => {
    renderDrawer(false);
    expect(screen.getByText('Backfill content')).toBeInTheDocument();
    expect(screen.queryByText('Action log content')).not.toBeInTheDocument();
    expect(screen.queryByText('Actor names content')).not.toBeInTheDocument();
    expect(screen.queryByText('Export content')).not.toBeInTheDocument();

    // Chosen while closed isn't opened.
    act(() => drawer.setSection('action-log'));
    expect(screen.queryByText('Action log content')).not.toBeInTheDocument();

    act(() => drawer.open('action-log'));
    expect(await screen.findByText('Action log content')).toBeVisible();
    act(() => drawer.open('export'));
    expect(await screen.findByText('Export content')).toBeVisible();
    act(() => drawer.close());
    expect(screen.getByText('Action log content')).toBeInTheDocument();
    expect(screen.getByText('Export content')).toBeInTheDocument();
    expect(screen.queryByText('Actor names content')).not.toBeInTheDocument();
  });

  test('can be opened at a section', () => {
    renderDrawer();
    act(() => drawer.open('script-options'));
    expect(screen.getByRole('tab', { name: 'Script options' })).toHaveAttribute('aria-selected', 'true');
  });
});
