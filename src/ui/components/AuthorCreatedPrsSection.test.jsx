/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorCreatedPrsSection } = require('./AuthorCreatedPrsSection');
const { PrDataProvider } = require('../state/PrDataProvider');

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
      <AuthorCreatedPrsSection />
    </PrDataProvider>,
  );
};

describe('AuthorCreatedPrsSection', () => {
  afterEach(() => {
    delete window.getPreferredActorKey;
    delete window.sortAuthorInsightsCreatedPrsDesc;
    delete window.formatIsoDatetime;
    delete window.navigateToPrInTableFromAuthorInsights;
    delete window.getAuthorInsightsCreatedPrStatus;
  });

  test('given no PRs by the selected author, when rendering, then the empty message is shown', () => {
    renderSection([buildEntry()], 'someone-else');
    expect(screen.getByText('No PRs by this author in the current local data scope.')).toBeInTheDocument();
  });

  test('given PRs by the selected author, when rendering, then the PR link and meta render', () => {
    window.getAuthorInsightsCreatedPrStatus = () => 'NO_CHANGE';
    renderSection([buildEntry()], 'octocat');

    expect(screen.getByText('#1 Fix the thing')).toBeInTheDocument();
    expect(screen.getByText(/Status: NO_CHANGE/)).toBeInTheDocument();
  });

  test('given "View in table", when clicked, then the navigation bridge fires with the PR number and repo', () => {
    const navigate = jest.fn();
    window.navigateToPrInTableFromAuthorInsights = navigate;
    renderSection([buildEntry()], 'octocat');

    screen.getByRole('button', { name: 'View in table' }).click();
    // repo disambiguates PR numbers that collide across repos - see
    // AuthorInsightsPrLink/PrTableApp's buildExpandedInsightsKey.
    expect(navigate).toHaveBeenCalledWith('1', 'owner/repo');
  });

  test('given a change to the selected author in Context, when it updates, then the list reflects the new author (no key remount needed)', () => {
    const byPrNumber = {
      1: buildEntry(),
      2: buildEntry({ prNumber: '2', data: { number: '2', authorLogin: 'other' } }),
    };
    render(
      <PrDataProvider initialPayload={{ byPrNumber }} initialSelectedAuthorLogin="octocat">
        <AuthorCreatedPrsSection />
      </PrDataProvider>,
    );
    expect(screen.getByText('#1 Fix the thing')).toBeInTheDocument();
    expect(screen.queryByText('#2 Fix the thing')).not.toBeInTheDocument();

    const { act } = require('@testing-library/react');
    act(() => {
      window.updateReactSelectedAuthorLogin('other');
    });

    expect(screen.queryByText('#1 Fix the thing')).not.toBeInTheDocument();
    expect(screen.getByText('#2 Fix the thing')).toBeInTheDocument();
  });
});
