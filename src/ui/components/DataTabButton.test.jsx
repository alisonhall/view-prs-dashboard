/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { DataTabButton } = require('./DataTabButton');
const { TabStateProvider } = require('./TabStateProvider');

const renderButtons = () =>
  render(
    <TabStateProvider>
      <DataTabButton tabKey="pr-data" label="PR data" panelId="tab-panel-pr-data" />
      <DataTabButton tabKey="review-stats" label="Review statistics" panelId="tab-panel-review-stats" />
      <DataTabButton tabKey="author-insights" label="Author Insights" panelId="tab-panel-author-insights" />
    </TabStateProvider>,
  );

describe('DataTabButton', () => {
  afterEach(() => {
    delete window.activateDataTab;
    delete window.setActiveDataTab;
  });

  test('given the default state, when rendering, then only PR data starts active', () => {
    renderButtons();

    expect(screen.getByRole('tab', { name: 'PR data' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Review statistics' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Author Insights' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'PR data' })).toHaveAttribute('id', 'tab-pr-data');
  });

  test('given a user clicks a different tab, when clicking, then that tab becomes active and the others deactivate', async () => {
    const user = userEvent.setup();
    renderButtons();

    await user.click(screen.getByRole('tab', { name: 'Review statistics' }));

    expect(screen.getByRole('tab', { name: 'Review statistics' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Review statistics' })).toHaveClass('is-active');
    expect(screen.getByRole('tab', { name: 'PR data' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'PR data' })).not.toHaveClass('is-active');
  });

  test('given a click, when activating a tab, then window.activateDataTab (the real vanilla DOM mutation) is called with the matching key', async () => {
    const activateDataTab = jest.fn();
    window.activateDataTab = activateDataTab;
    const user = userEvent.setup();
    renderButtons();

    await user.click(screen.getByRole('tab', { name: 'Author Insights' }));

    expect(activateDataTab).toHaveBeenCalledWith('author-insights');
  });
});
