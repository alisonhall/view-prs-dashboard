/** @jest-environment jsdom */

const React = require('react');
const { render } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsNotesSection } = require('./AuthorInsightsNotesSection');

describe('AuthorInsightsNotesSection', () => {
  afterEach(() => {
    delete window.buildAuthorInsightsNotesSection;
  });

  test('given the bridge returns a section node, when rendering, then it is appended into the container', () => {
    window.buildAuthorInsightsNotesSection = jest.fn((selectedAuthor, rows) => {
      const section = document.createElement('section');
      section.className = 'author-insights-section';
      section.textContent = `notes for ${selectedAuthor.login} (${rows.length})`;
      return section;
    });

    const selectedAuthor = { login: 'octocat', name: 'The Octocat' };
    const { container } = render(
      <AuthorInsightsNotesSection rows={[{ prNumber: '1' }]} selectedAuthor={selectedAuthor} actorsMap={{}} />,
    );

    expect(window.buildAuthorInsightsNotesSection).toHaveBeenCalledWith(selectedAuthor, [{ prNumber: '1' }], {});
    expect(container.querySelector('.author-insights-section')?.textContent).toBe('notes for octocat (1)');
  });

  test('given the bridge is missing, when rendering, then nothing is appended and it does not throw', () => {
    const { container } = render(
      <AuthorInsightsNotesSection rows={[]} selectedAuthor={{ login: 'octocat' }} actorsMap={{}} />,
    );
    expect(container.querySelector('.author-insights-section')).toBeNull();
  });

  test('given a re-render with a different selectedAuthor, when re-rendering, then the container reflects the latest bridge output', () => {
    window.buildAuthorInsightsNotesSection = jest.fn((selectedAuthor) => {
      const section = document.createElement('section');
      section.textContent = `author:${selectedAuthor.login}`;
      return section;
    });

    const { container, rerender } = render(
      <AuthorInsightsNotesSection rows={[]} selectedAuthor={{ login: 'octocat' }} actorsMap={{}} />,
    );
    expect(container.textContent).toBe('author:octocat');

    rerender(<AuthorInsightsNotesSection rows={[]} selectedAuthor={{ login: 'other' }} actorsMap={{}} />);
    expect(container.textContent).toBe('author:other');
  });
});
