/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrTable } = require('./PrTable');

describe('PrTable', () => {
  const makeEntry = (number) => ({
    prNumber: String(number),
    repo: 'owner/repo',
    section: 'open',
    data: { number: String(number), title: `PR ${number}`, labels: [] },
  });

  test('given the standard column set, when rendering, then the colgroup and header row match vanilla exactly', () => {
    render(<PrTable prs={[]} repo="owner/repo" sectionKey="open" dateHeader="LAST ACTIVITY" expandedInsights={{}} />);
    const cols = document.querySelectorAll('table.pr-data-table colgroup col');
    expect(Array.from(cols).map((col) => col.className)).toEqual([
      'pr-col-select',
      'pr-col-attention',
      'pr-col-number',
      'pr-col-status',
      'pr-col-approved',
      'pr-col-title',
      'pr-col-author',
      'pr-col-labels',
      'pr-col-check',
      'pr-col-date',
      'pr-col-actions',
    ]);
    expect(screen.getByText('Sel')).toHaveClass('compact-header-abbrev');
    expect(screen.getByText('STATUS')).toBeInTheDocument();
    expect(screen.getByText('LAST ACTIVITY')).toBeInTheDocument();
  });

  test('given several PR entries, when rendering, then produces one row per entry keyed by PR number', () => {
    render(
      <PrTable
        prs={[makeEntry(101), makeEntry(102), makeEntry(103)]}
        repo="owner/repo"
        sectionKey="open"
        dateHeader="LAST ACTIVITY"
        expandedInsights={{}}
      />,
    );
    expect(document.querySelectorAll('tbody tr.pr-row')).toHaveLength(3);
  });

  test('given getPrFlags, when rendering, then each row receives its own flags rather than a single shared value', () => {
    const getPrFlags = (prNumber) => ({ isFlagged: prNumber === '101', isInReview: false, isAcknowledged: false });
    render(
      <PrTable
        prs={[makeEntry(101), makeEntry(102)]}
        repo="owner/repo"
        sectionKey="open"
        dateHeader="LAST ACTIVITY"
        expandedInsights={{}}
        getPrFlags={getPrFlags}
      />,
    );
    const rows = document.querySelectorAll('tbody tr.pr-row');
    expect(rows[0].querySelector('.flagged-toggle')).toBeChecked();
    expect(rows[1].querySelector('.flagged-toggle')).not.toBeChecked();
  });

  test('given an onViewJson prop, when the {} button is clicked on a row, then it is threaded down with that row\'s entry/pr', () => {
    const onViewJson = jest.fn();
    render(
      <PrTable
        prs={[makeEntry(101), makeEntry(102)]}
        repo="owner/repo"
        sectionKey="open"
        dateHeader="LAST ACTIVITY"
        expandedInsights={{}}
        onViewJson={onViewJson}
      />,
    );
    const rows = document.querySelectorAll('tbody tr.pr-row');
    rows[1].querySelector('.row-action-btn.view-json').click();
    expect(onViewJson).toHaveBeenCalledWith(
      { prNumber: '102', repo: 'owner/repo' },
      { number: '102', title: 'PR 102', labels: [] },
    );
  });
});
