/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { LinesChangedInsight } = require('./LinesChangedInsight');

describe('LinesChangedInsight', () => {
  afterEach(() => {
    delete window.toCount;
  });

  test('given missing additions/deletions, when rendering, then shows a dash', () => {
    render(<LinesChangedInsight pr={{}} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  test('given additions and deletions, when rendering, then shows files/additions/deletions/total', () => {
    window.toCount = (v) => Number.parseInt(v, 10) || 0;
    render(<LinesChangedInsight pr={{ additions: '10', deletions: '5', changedFilesCount: '3' }} />);
    expect(screen.getByText('3 files changed')).toBeInTheDocument();
    expect(screen.getByText('+10 additions')).toBeInTheDocument();
    expect(screen.getByText('-5 deletions')).toBeInTheDocument();
    expect(screen.getByText('15 lines changed')).toBeInTheDocument();
  });
});
