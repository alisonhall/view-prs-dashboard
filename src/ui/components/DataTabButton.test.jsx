/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { DataTabButton } = require('./DataTabButton');
const { TabStateProvider } = require('./TabStateProvider');
const { TabPanelVisibilitySync } = require('./TabPanelVisibilitySync');

const renderButtons = () =>
  render(
    <TabStateProvider>
      <DataTabButton tabKey="pr-data" label="PR data" panelId="tab-panel-pr-data" />
      <DataTabButton tabKey="review-stats" label="Review statistics" panelId="tab-panel-review-stats" />
      <DataTabButton tabKey="author-insights" label="Author Insights" panelId="tab-panel-author-insights" />
      <TabPanelVisibilitySync />
    </TabStateProvider>,
  );

describe('DataTabButton', () => {
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

  describe('panel visibility (Phase H.22, see REACT_MIGRATION_PLAN.md)', () => {
    let panels;

    beforeEach(() => {
      panels = ['tab-panel-pr-data', 'tab-panel-review-stats', 'tab-panel-author-insights'].map((id) => {
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

      await user.click(screen.getByRole('tab', { name: 'Author Insights' }));

      expect(document.getElementById('tab-panel-author-insights').hidden).toBe(false);
      expect(document.getElementById('tab-panel-pr-data').hidden).toBe(true);
      expect(document.getElementById('tab-panel-review-stats').hidden).toBe(true);
    });
  });
});
