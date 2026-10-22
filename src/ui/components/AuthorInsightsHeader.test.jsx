/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsHeader } = require('./AuthorInsightsHeader');
const { PrDataProvider } = require('../state/PrDataProvider');
const { createPrDataProbe } = require('../test-fixtures/pr-data-probe');
// Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): reads and
// writes PrDataProvider through this probe, not window.* bridges.
const prDataProbe = createPrDataProbe();

const renderHeader = (selectedAuthorLogin, actorsMap = {}) =>
  render(
    <PrDataProvider initialPayload={{ actorsMap }} initialSelectedAuthorLogin={selectedAuthorLogin}>
      <prDataProbe.PrDataProbe />
      <AuthorInsightsHeader />
    </PrDataProvider>,
  );

describe('AuthorInsightsHeader', () => {
  test('given a selected author name, when rendering, then it shows the "Showing insights for" text', () => {
    const { container } = renderHeader('octocat', { octocat: 'The Octocat' });
    expect(container.querySelector('.author-insights-selected')?.textContent).toBe(
      'Showing insights for The Octocat',
    );
  });

  test('given no selected author name, when rendering, then nothing is rendered', () => {
    const { container } = renderHeader('');
    expect(container.querySelector('.author-insights-selected')).toBeNull();
  });

  test('given a change to the selected author in Context, when it updates, then the text updates', () => {
    const { container } = renderHeader('author-one', { 'author-one': 'Author One', 'author-two': 'Author Two' });
    expect(container.querySelector('.author-insights-selected')?.textContent).toBe(
      'Showing insights for Author One',
    );

    act(() => {
      prDataProbe.setSelectedAuthorLogin('author-two');
    });
    expect(container.querySelector('.author-insights-selected')?.textContent).toBe(
      'Showing insights for Author Two',
    );
  });
});
