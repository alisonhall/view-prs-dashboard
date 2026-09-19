/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AppliedFilterSummary } = require('./AppliedFilterSummary');

describe('AppliedFilterSummary', () => {
  test('given summary text, when rendering, then shows it in the <pre> summary node', () => {
    render(<AppliedFilterSummary summaryText="repo=owner/repo | Rows: 5" filterChips={[]} />);
    expect(document.getElementById('management-filter-summary')).toHaveTextContent(
      'repo=owner/repo | Rows: 5',
    );
  });

  test('given no summary text, when rendering, then falls back to the unavailable message', () => {
    render(<AppliedFilterSummary summaryText="" filterChips={[]} />);
    expect(document.getElementById('management-filter-summary')).toHaveTextContent(
      'Applied filters summary unavailable.',
    );
  });

  test('given no filter chips, when rendering, then shows the "No filters applied" placeholder chip', () => {
    render(<AppliedFilterSummary summaryText="x" filterChips={[]} />);
    const chips = document.querySelectorAll('#management-filter-chips .applied-filter-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent('No filters applied');
  });

  test('given filter chips, when rendering, then shows one chip per entry in order', () => {
    render(<AppliedFilterSummary summaryText="x" filterChips={['scope=needs-attention', 'label=bug']} />);
    const chips = Array.from(
      document.querySelectorAll('#management-filter-chips .applied-filter-chip'),
    ).map((node) => node.textContent);
    expect(chips).toEqual(['scope=needs-attention', 'label=bug']);
  });

  test('given falsy entries mixed into filterChips, when rendering, then they are filtered out', () => {
    render(<AppliedFilterSummary summaryText="x" filterChips={['a', null, '', undefined, 'b']} />);
    const chips = Array.from(
      document.querySelectorAll('#management-filter-chips .applied-filter-chip'),
    ).map((node) => node.textContent);
    expect(chips).toEqual(['a', 'b']);
  });

  test('given no filterChips prop at all, when rendering, then treats it as empty (no crash)', () => {
    render(<AppliedFilterSummary summaryText="x" />);
    expect(screen.getByText('No filters applied')).toBeInTheDocument();
  });
});
