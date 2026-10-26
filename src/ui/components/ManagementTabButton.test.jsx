/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ManagementTabButton } = require('./ManagementTabButton');
const { TabStateProvider } = require('./TabStateProvider');
const { TabPanelVisibilitySync } = require('./TabPanelVisibilitySync');

const renderButtons = () =>
  render(
    <TabStateProvider>
      <ManagementTabButton tabKey="script" label="Run & Filter" panelId="tab-panel-script" />
      <ManagementTabButton tabKey="backfill" label="Backfill" panelId="tab-panel-backfill" />
      <ManagementTabButton tabKey="action-log" label="Action Log" panelId="tab-panel-action-log" />
      <TabPanelVisibilitySync />
    </TabStateProvider>,
  );

describe('ManagementTabButton', () => {
  test('given the default state, when rendering, then only Run & Filter starts active', () => {
    renderButtons();

    expect(screen.getByRole('tab', { name: 'Run & Filter' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Backfill' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Action Log' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Run & Filter' })).toHaveAttribute('id', 'tab-script');
  });

  test('given a user clicks a different tab, when clicking, then that tab becomes active and the others deactivate', async () => {
    const user = userEvent.setup();
    renderButtons();

    await user.click(screen.getByRole('tab', { name: 'Backfill' }));

    expect(screen.getByRole('tab', { name: 'Backfill' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Backfill' })).toHaveClass('is-active');
    expect(screen.getByRole('tab', { name: 'Run & Filter' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Run & Filter' })).not.toHaveClass('is-active');
  });

  describe('panel visibility (Phase H.22, see REACT_MIGRATION_PLAN.md)', () => {
    let panels;

    beforeEach(() => {
      panels = ['tab-panel-script', 'tab-panel-backfill', 'tab-panel-action-log'].map((id) => {
        const panel = document.createElement('div');
        panel.id = id;
        document.body.appendChild(panel);
        return panel;
      });
    });

    afterEach(() => {
      panels.forEach((panel) => document.body.removeChild(panel));
    });

    test('given a click, when activating a tab, then TabPanelVisibilitySync shows the matching panel and hides the others', async () => {
      const user = userEvent.setup();
      renderButtons();

      await user.click(screen.getByRole('tab', { name: 'Backfill' }));

      expect(document.getElementById('tab-panel-backfill').hidden).toBe(false);
      expect(document.getElementById('tab-panel-script').hidden).toBe(true);
      expect(document.getElementById('tab-panel-action-log').hidden).toBe(true);
    });
  });
});
