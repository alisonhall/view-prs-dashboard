/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorCreatedPrsSection } = require('./AuthorCreatedPrsSection');
const { PrDataProvider } = require('../state/PrDataProvider');
const { createPrDataProbe } = require('../test-fixtures/pr-data-probe');
// Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): reads and
// writes PrDataProvider through this probe, not window.* bridges.
const prDataProbe = createPrDataProbe();

const buildEntry = (overrides = {}) => ({
  prNumber: '1',
  repo: 'owner/repo',
  ...overrides,
  data: {
    number: '1',
    title: 'Fix the thing',
    authorLogin: 'octocat',
    author: 'The Octocat',
    status: 'NO_CHANGE',
    approved: 'NO',
    approvalCount: 0,
    labels: [],
    ...overrides.data,
  },
});

const renderSection = (rows, selectedAuthorLogin) => {
  const byPrNumber = {};
  rows.forEach((entry) => {
    byPrNumber[entry.prNumber] = entry;
  });
  return render(
    <PrDataProvider initialPayload={{ byPrNumber }} initialSelectedAuthorLogin={selectedAuthorLogin}>
      <prDataProbe.PrDataProbe />
      <AuthorCreatedPrsSection />
    </PrDataProvider>,
  );
};

describe('AuthorCreatedPrsSection', () => {

  test('given no PRs by the selected author, when rendering, then the empty message is shown', () => {
    renderSection([buildEntry()], 'someone-else');
    expect(screen.getByText('No PRs by this author in the current local data scope.')).toBeInTheDocument();
  });

  test('given PRs by the selected author, when rendering, then the PR link and meta render', () => {
    renderSection([buildEntry()], 'octocat');

    expect(screen.getByText('#1 Fix the thing')).toBeInTheDocument();
    expect(screen.getByText(/Status: NO_CHANGE/)).toBeInTheDocument();
  });

  // Phase H.16 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 2): window.navigateToPrInTableFromAuthorInsights is deleted -
  // AuthorInsightsPrLink.jsx's button now calls useNavigateToPrInTable()
  // directly, which dispatches 'pr-navigate-to-insights' (PrTableApp.jsx's
  // own listener) instead of a window.* bridge.
  test('given "View in table", when clicked, then pr-navigate-to-insights fires with the PR number and repo', () => {
    const events = [];
    const handler = (event) => events.push(event.detail);
    window.addEventListener('pr-navigate-to-insights', handler);
    renderSection([buildEntry()], 'octocat');

    screen.getByRole('button', { name: 'View in table' }).click();
    // repo disambiguates PR numbers that collide across repos - see
    // AuthorInsightsPrLink/PrTableApp's buildExpandedInsightsKey.
    expect(events).toEqual([{ prNumber: '1', repo: 'owner/repo', focusUnsaved: false }]);

    window.removeEventListener('pr-navigate-to-insights', handler);
  });

  test('given a change to the selected author in Context, when it updates, then the list reflects the new author (no key remount needed)', () => {
    const byPrNumber = {
      1: buildEntry(),
      2: buildEntry({ prNumber: '2', data: { number: '2', authorLogin: 'other' } }),
    };
    render(
      <PrDataProvider initialPayload={{ byPrNumber }} initialSelectedAuthorLogin="octocat">
        <prDataProbe.PrDataProbe />
        <AuthorCreatedPrsSection />
      </PrDataProvider>,
    );
    expect(screen.getByText('#1 Fix the thing')).toBeInTheDocument();
    expect(screen.queryByText('#2 Fix the thing')).not.toBeInTheDocument();

    const { act } = require('@testing-library/react');
    act(() => {
      prDataProbe.setSelectedAuthorLogin('other');
    });

    expect(screen.queryByText('#1 Fix the thing')).not.toBeInTheDocument();
    expect(screen.getByText('#2 Fix the thing')).toBeInTheDocument();
  });
});
