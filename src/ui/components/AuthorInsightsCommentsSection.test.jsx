/** @jest-environment jsdom */

const React = require('react');
const { render } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsCommentsSection } = require('./AuthorInsightsCommentsSection');

describe('AuthorInsightsCommentsSection', () => {
  afterEach(() => {
    delete window.buildAuthorInsightsCommentsSection;
  });

  test('given the bridge returns a section node, when rendering, then it is appended into the container', () => {
    window.buildAuthorInsightsCommentsSection = jest.fn((selectedAuthor, rows) => {
      const section = document.createElement('section');
      section.className = 'author-insights-section';
      section.textContent = `comments for ${selectedAuthor.login} (${rows.length})`;
      return section;
    });

    const selectedAuthor = { login: 'octocat', name: 'The Octocat' };
    const { container } = render(
      <AuthorInsightsCommentsSection rows={[{ prNumber: '1' }]} selectedAuthor={selectedAuthor} actorsMap={{}} />,
    );

    expect(window.buildAuthorInsightsCommentsSection).toHaveBeenCalledWith(
      selectedAuthor,
      [{ prNumber: '1' }],
      {},
    );
    expect(container.querySelector('.author-insights-section')?.textContent).toBe(
      'comments for octocat (1)',
    );
  });

  test('given no selected author, when rendering, then nothing is appended and the bridge is not called', () => {
    window.buildAuthorInsightsCommentsSection = jest.fn();
    const { container } = render(
      <AuthorInsightsCommentsSection rows={[]} selectedAuthor={null} actorsMap={{}} />,
    );
    expect(container.querySelector('.author-insights-section')).toBeNull();
    expect(window.buildAuthorInsightsCommentsSection).not.toHaveBeenCalled();
  });

  test('given the bridge is missing, when rendering, then nothing is appended and it does not throw', () => {
    const { container } = render(
      <AuthorInsightsCommentsSection rows={[]} selectedAuthor={{ login: 'octocat' }} actorsMap={{}} />,
    );
    expect(container.querySelector('.author-insights-section')).toBeNull();
  });

  test('given a re-render with a different selectedAuthor, when re-rendering, then the container reflects the latest bridge output', () => {
    window.buildAuthorInsightsCommentsSection = jest.fn((selectedAuthor) => {
      const section = document.createElement('section');
      section.textContent = `author:${selectedAuthor.login}`;
      return section;
    });

    const { container, rerender } = render(
      <AuthorInsightsCommentsSection rows={[]} selectedAuthor={{ login: 'octocat' }} actorsMap={{}} />,
    );
    expect(container.textContent).toBe('author:octocat');

    rerender(
      <AuthorInsightsCommentsSection rows={[]} selectedAuthor={{ login: 'other' }} actorsMap={{}} />,
    );
    expect(container.textContent).toBe('author:other');
  });
});
