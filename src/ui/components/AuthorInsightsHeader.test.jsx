/** @jest-environment jsdom */

const { render, screen, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsHeader } = require('./AuthorInsightsHeader');
const { PrDataProvider } = require('../state/PrDataProvider');
const { createPrDataProbe } = require('../test-fixtures/pr-data-probe');
// Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): reads and
// writes PrDataProvider through this probe, not window.* bridges.
const prDataProbe = createPrDataProbe();
const { AuthorInsightsContext, defaultAuthorInsights } = require('../state/AuthorInsightsContext');
const { AuthorInsightsDraftsContext } = require('../state/AuthorInsightsDraftsContext');

const ACTORS = { octocat: 'The Octocat', hubot: 'Hubot' };

// The Octocat: 2 open, 1 merged and 1 closed; Hubot: 1 open.
const ROWS = {
  1: { data: { authorLogin: 'octocat' } },
  2: { data: { authorLogin: 'octocat' } },
  3: { data: { authorLogin: 'octocat', mergedAt: '2026-10-01T00:00:00Z' } },
  4: { data: { authorLogin: 'octocat', closedAt: '2026-10-02T00:00:00Z' } },
  5: { data: { authorLogin: 'hubot' } },
};

const renderHeader = (selectedAuthorLogin, { rows = ROWS, comments } = {}) =>
  render(
    <PrDataProvider initialPayload={{ actorsMap: ACTORS, byPrNumber: rows }} initialSelectedAuthorLogin={selectedAuthorLogin}>
      <prDataProbe.PrDataProbe />
      <AuthorInsightsContext.Provider
        value={{ ...defaultAuthorInsights, buildAuthorInsightsEntries: () => Object.entries(ACTORS).map(([login, name]) => ({ login, name })) }}
      >
        <AuthorInsightsDraftsContext.Provider
          value={{
            hasLoadedManualComments: (login) => Boolean(comments && login in comments),
            getManualComments: (login) => comments?.[login] || [],
          }}
        >
          <AuthorInsightsHeader />
        </AuthorInsightsDraftsContext.Provider>
      </AuthorInsightsContext.Provider>
    </PrDataProvider>,
  );

const counts = () => screen.getAllByRole('listitem').map((item) => item.textContent);

describe('AuthorInsightsHeader', () => {
  test('the selected author: avatar, display name and login, then their open and merged PRs', () => {
    const { container } = renderHeader('octocat');

    expect(container.querySelector('.ui-avatar')).toHaveAttribute('data-size', 'lg');
    expect(container.querySelector('.ui-avatar')).toHaveTextContent('TO');
    expect(container.querySelector('.author-insights-selected-name')).toHaveTextContent('The Octocatoctocat');
    expect(screen.getByRole('list', { name: 'Counts' })).toBeInTheDocument();
    expect(counts()).toEqual(['2 open PRs', '1 merged']);
  });

  test('no login when it is the name; one open PR in the singular', () => {
    const { container } = renderHeader('mona', { rows: { 1: { data: { authorLogin: 'mona' } } } });
    expect(container.querySelector('.author-insights-selected-login')).toBeNull();
    expect(counts()).toEqual(['1 open PR', '0 merged']);
  });

  test('the comments saved about them, once those have loaded', () => {
    const { unmount } = renderHeader('octocat', { comments: { octocat: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } });
    expect(counts()).toEqual(['2 open PRs', '1 merged', '3 comments saved']);
    unmount();

    renderHeader('hubot', { comments: { hubot: [{ id: 'a' }] } });
    expect(counts()).toEqual(['1 open PR', '0 merged', '1 comment saved']);
  });

  test('nothing with no author selected', () => {
    const { container } = renderHeader('');
    expect(container).toBeEmptyDOMElement();
  });

  test('follows the selected author', () => {
    const { container } = renderHeader('octocat');

    act(() => {
      prDataProbe.setSelectedAuthorLogin('hubot');
    });

    expect(container.querySelector('.author-insights-selected-name')).toHaveTextContent('Hubot');
    expect(counts()).toEqual(['1 open PR', '0 merged']);
  });
});
