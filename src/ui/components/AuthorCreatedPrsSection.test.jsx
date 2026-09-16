/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorCreatedPrsSection } = require('./AuthorCreatedPrsSection');

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

describe('AuthorCreatedPrsSection', () => {
  afterEach(() => {
    delete window.getPreferredActorKey;
    delete window.sortAuthorInsightsCreatedPrsDesc;
    delete window.formatIsoDatetime;
    delete window.navigateToPrInTableFromAuthorInsights;
    delete window.getAuthorInsightsCreatedPrStatus;
  });

  test('given no PRs by the selected author, when rendering, then the empty message is shown', () => {
    render(<AuthorCreatedPrsSection rows={[buildEntry()]} selectedAuthorLogin="someone-else" />);
    expect(screen.getByText('No PRs by this author in the current local data scope.')).toBeInTheDocument();
  });

  test('given PRs by the selected author, when rendering, then the PR link and meta render', () => {
    window.getAuthorInsightsCreatedPrStatus = () => 'NO_CHANGE';
    render(<AuthorCreatedPrsSection rows={[buildEntry()]} selectedAuthorLogin="octocat" />);

    expect(screen.getByText('#1 Fix the thing')).toBeInTheDocument();
    expect(screen.getByText(/Status: NO_CHANGE/)).toBeInTheDocument();
  });

  test('given "View in table", when clicked, then the navigation bridge fires with the PR number', () => {
    const navigate = jest.fn();
    window.navigateToPrInTableFromAuthorInsights = navigate;
    render(<AuthorCreatedPrsSection rows={[buildEntry()]} selectedAuthorLogin="octocat" />);

    screen.getByRole('button', { name: 'View in table' }).click();
    expect(navigate).toHaveBeenCalledWith('1');
  });

  test('given a re-render with a different selectedAuthorLogin, when re-rendering, then the list reflects the new author (no key remount needed)', () => {
    const { rerender } = render(
      <AuthorCreatedPrsSection rows={[buildEntry(), buildEntry({ prNumber: '2', data: { number: '2', authorLogin: 'other' } })]} selectedAuthorLogin="octocat" />,
    );
    expect(screen.getByText('#1 Fix the thing')).toBeInTheDocument();
    expect(screen.queryByText('#2 Fix the thing')).not.toBeInTheDocument();

    rerender(
      <AuthorCreatedPrsSection rows={[buildEntry(), buildEntry({ prNumber: '2', data: { number: '2', authorLogin: 'other' } })]} selectedAuthorLogin="other" />,
    );
    expect(screen.queryByText('#1 Fix the thing')).not.toBeInTheDocument();
    expect(screen.getByText('#2 Fix the thing')).toBeInTheDocument();
  });
});
