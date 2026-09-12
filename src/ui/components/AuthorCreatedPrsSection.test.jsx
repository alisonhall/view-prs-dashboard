/** @jest-environment jsdom */

const React = require('react');
const { render } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorCreatedPrsSection } = require('./AuthorCreatedPrsSection');

describe('AuthorCreatedPrsSection', () => {
  afterEach(() => {
    delete window.buildAuthorInsightsCreatedPrsSection;
  });

  test('given the bridge returns a section node, when rendering, then it is appended into the container', () => {
    window.buildAuthorInsightsCreatedPrsSection = jest.fn((rows) => {
      const section = document.createElement('section');
      section.className = 'author-insights-section';
      section.textContent = `built for ${rows.length} rows`;
      return section;
    });

    const { container } = render(<AuthorCreatedPrsSection rows={[{ prNumber: '1' }, { prNumber: '2' }]} />);

    expect(window.buildAuthorInsightsCreatedPrsSection).toHaveBeenCalledWith([
      { prNumber: '1' },
      { prNumber: '2' },
    ]);
    expect(container.querySelector('.author-insights-section')?.textContent).toBe('built for 2 rows');
  });

  test('given the bridge is missing, when rendering, then nothing is appended and it does not throw', () => {
    const { container } = render(<AuthorCreatedPrsSection rows={[]} />);
    expect(container.querySelector('.author-insights-section')).toBeNull();
  });

  test('given a re-render with a new key and different rows, when re-rendering, then the container reflects the latest bridge output', () => {
    window.buildAuthorInsightsCreatedPrsSection = jest.fn((rows) => {
      const section = document.createElement('section');
      section.textContent = `count:${rows.length}`;
      return section;
    });

    const { container, rerender } = render(<AuthorCreatedPrsSection key={1} rows={[{ prNumber: '1' }]} />);
    expect(container.textContent).toBe('count:1');

    rerender(<AuthorCreatedPrsSection key={2} rows={[{ prNumber: '1' }, { prNumber: '2' }]} />);
    expect(container.textContent).toBe('count:2');
  });
});
