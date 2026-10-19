/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsPrLink } = require('./AuthorInsightsPrLink');

describe('AuthorInsightsPrLink', () => {
  test('given a PR entry with a url, when rendering, then the external link uses it', () => {
    render(<AuthorInsightsPrLink entry={{ prNumber: '5', repo: 'owner/repo', data: { number: '5', title: 'My PR', url: 'https://github.com/owner/repo/pull/5' } }} />);

    const link = screen.getByRole('link', { name: '#5 My PR' });
    expect(link).toHaveAttribute('href', 'https://github.com/owner/repo/pull/5');
    expect(link).toHaveAttribute('target', '_blank');
  });

  test('given no url, when rendering, then a github.com link is built from repo/DEFAULT_REPO and the PR number', () => {
    render(<AuthorInsightsPrLink entry={{ prNumber: '7', repo: 'owner/repo', data: { number: '7', title: 'Another PR' } }} />);

    expect(screen.getByRole('link', { name: '#7 Another PR' })).toHaveAttribute('href', 'https://github.com/owner/repo/pull/7');
  });

  // Phase H.16 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 2): window.navigateToPrInTableFromAuthorInsights is deleted -
  // the button now calls useNavigateToPrInTable() directly, which
  // dispatches 'pr-navigate-to-insights' instead of a window.* bridge.
  test('given "View in table", when clicked, then pr-navigate-to-insights fires with the PR number and repo', () => {
    const events = [];
    const handler = (event) => events.push(event.detail);
    window.addEventListener('pr-navigate-to-insights', handler);
    render(<AuthorInsightsPrLink entry={{ prNumber: '9', repo: 'owner/repo', data: { number: '9', title: 'PR nine' } }} />);

    screen.getByRole('button', { name: 'View in table' }).click();
    // repo is passed through (not just the PR number) since PR numbers are
    // only unique within a repo - other repos' PRs can share the same
    // number, and the table now renders rows from every repo at once.
    expect(events).toEqual([{ prNumber: '9', repo: 'owner/repo', focusUnsaved: false }]);

    window.removeEventListener('pr-navigate-to-insights', handler);
  });
});
