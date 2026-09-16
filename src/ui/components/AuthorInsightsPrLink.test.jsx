/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsPrLink } = require('./AuthorInsightsPrLink');

describe('AuthorInsightsPrLink', () => {
  afterEach(() => {
    delete window.navigateToPrInTableFromAuthorInsights;
    delete window.DEFAULT_REPO;
  });

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

  test('given "View in table", when clicked, then window.navigateToPrInTableFromAuthorInsights fires with the PR number', () => {
    const navigate = jest.fn();
    window.navigateToPrInTableFromAuthorInsights = navigate;
    render(<AuthorInsightsPrLink entry={{ prNumber: '9', data: { number: '9', title: 'PR nine' } }} />);

    screen.getByRole('button', { name: 'View in table' }).click();
    expect(navigate).toHaveBeenCalledWith('9');
  });
});
