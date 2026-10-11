/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ManagementTabButton } = require('./ManagementTabButton');
const { TabStateProvider } = require('./TabStateProvider');

const renderButtons = () =>
  render(
    <TabStateProvider>
      <ManagementTabButton tabKey="status" label="Activity" panelId="tab-panel-status" />
      <ManagementTabButton tabKey="script" label="Run & Filter" panelId="tab-panel-script" />
      <ManagementTabButton tabKey="backfill" label="Backfill" panelId="tab-panel-backfill" />
    </TabStateProvider>,
  );

describe('ManagementTabButton', () => {
  afterEach(() => {
    delete window.activateManagementTab;
    delete window.setActiveManagementTab;
  });

  test('given the default state, when rendering, then only Activity starts active', () => {
    renderButtons();

    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Run & Filter' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Backfill' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('id', 'tab-status');
  });

  test('given a user clicks a different tab, when clicking, then that tab becomes active and the others deactivate', async () => {
    const user = userEvent.setup();
    renderButtons();

    await user.click(screen.getByRole('tab', { name: 'Backfill' }));

    expect(screen.getByRole('tab', { name: 'Backfill' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Backfill' })).toHaveClass('is-active');
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Activity' })).not.toHaveClass('is-active');
  });

  test('given a click, when activating a tab, then window.activateManagementTab (the real vanilla DOM mutation) is called with the matching key', async () => {
    const activateManagementTab = jest.fn();
    window.activateManagementTab = activateManagementTab;
    const user = userEvent.setup();
    renderButtons();

    await user.click(screen.getByRole('tab', { name: 'Run & Filter' }));

    expect(activateManagementTab).toHaveBeenCalledWith('script');
  });
});
