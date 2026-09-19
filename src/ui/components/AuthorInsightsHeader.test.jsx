/** @jest-environment jsdom */

const React = require('react');
const { render } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsHeader } = require('./AuthorInsightsHeader');

describe('AuthorInsightsHeader', () => {
  test('given a selected author name, when rendering, then it shows the "Showing insights for" text', () => {
    const { container } = render(<AuthorInsightsHeader selectedAuthorName="The Octocat" />);
    expect(container.querySelector('.author-insights-selected')?.textContent).toBe(
      'Showing insights for The Octocat',
    );
  });

  test('given no selected author name, when rendering, then nothing is rendered', () => {
    const { container } = render(<AuthorInsightsHeader selectedAuthorName="" />);
    expect(container.querySelector('.author-insights-selected')).toBeNull();
  });

  test('given a re-render with a different author name, when re-rendering, then the text updates', () => {
    const { container, rerender } = render(<AuthorInsightsHeader selectedAuthorName="Author One" />);
    expect(container.querySelector('.author-insights-selected')?.textContent).toBe(
      'Showing insights for Author One',
    );

    rerender(<AuthorInsightsHeader selectedAuthorName="Author Two" />);
    expect(container.querySelector('.author-insights-selected')?.textContent).toBe(
      'Showing insights for Author Two',
    );
  });
});
