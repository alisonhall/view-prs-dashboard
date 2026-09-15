/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrSection } = require('./PrSection');

describe('PrSection', () => {
  const baseSection = {
    key: 'flagged',
    title: 'Flagged',
    prs: [],
    isSmartGroup: true,
    lifecycleSection: 'open',
    dateHeader: 'LAST ACTIVITY',
    attentionCount: 0,
    defaultOpen: true,
  };

  const renderSection = (sectionOverrides = {}, propOverrides = {}) =>
    render(
      <PrSection
        section={{ ...baseSection, ...sectionOverrides }}
        repo="owner/repo"
        actorsMap={{}}
        isOpen
        expandedInsights={{}}
        onToggleSection={() => {}}
        {...propOverrides}
      />,
    );

  test('given a section, when rendering, then uses the vanilla <details>/<summary> shell classes', () => {
    renderSection();
    const details = document.querySelector('details.pr-group-section');
    expect(details).toHaveClass('pr-group-section-flagged');
    expect(details).toHaveAttribute('data-pr-section', 'flagged');
    expect(details.querySelector('summary')).toHaveClass('pr-group-section-summary');
  });

  test('given a title and PR count, when rendering, then the summary shows both', () => {
    renderSection({ title: 'Open PRs', prs: [{ data: { number: '1' } }, { data: { number: '2' } }] });
    expect(screen.getByText('Open PRs')).toHaveClass('pr-group-section-title');
    expect(screen.getByText('2')).toHaveClass('pr-group-section-count');
  });

  // Regression test: the "Total PRs in section" badge used to read
  // prs.length - but `prs` is the deduplicated *rendered* row set (a PR
  // already shown in a smart group above, e.g. "Open PRs I'm Involved In",
  // is excluded from a lifecycle section's rendered rows so it isn't shown
  // twice). That made "Open PRs" undercount whenever most of a user's open
  // PRs were also flagged/in-review/interacted-with. totalCount (the full,
  // undeduplicated count PrTableApp computes) must be what's displayed.
  test('given totalCount differs from the deduplicated prs list, when rendering, then the count badge shows totalCount (not prs.length)', () => {
    renderSection({
      title: 'Open PRs',
      prs: [{ data: { number: '2' } }],
      totalCount: 5,
    });
    expect(screen.getByText('5')).toHaveClass('pr-group-section-count');
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  test('given no totalCount is provided, when rendering, then the count badge falls back to prs.length', () => {
    renderSection({
      title: 'Flagged',
      prs: [{ data: { number: '1' } }, { data: { number: '2' } }, { data: { number: '3' } }],
      totalCount: undefined,
    });
    expect(screen.getByText('3')).toHaveClass('pr-group-section-count');
  });

  test('given attentionCount is 0, when rendering, then omits the attention badge', () => {
    renderSection({ attentionCount: 0 });
    expect(document.querySelector('.pr-group-section-attention-count')).not.toBeInTheDocument();
  });

  test('given attentionCount > 0, when rendering, then shows "Attention: N"', () => {
    renderSection({ attentionCount: 3 });
    expect(screen.getByText('Attention: 3')).toHaveClass('pr-group-section-attention-count');
  });

  test('given isOpen=false, when rendering, then the <details> element is closed', () => {
    renderSection({}, { isOpen: false });
    expect(document.querySelector('details')).not.toHaveAttribute('open');
  });

  test('given no PRs, when rendering, then shows the "(none)" placeholder instead of a table', () => {
    renderSection({ prs: [] });
    expect(screen.getByText('(none)')).toBeInTheDocument();
    expect(document.querySelector('table.pr-data-table')).not.toBeInTheDocument();
  });
});
