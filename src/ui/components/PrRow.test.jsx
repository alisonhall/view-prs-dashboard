/** @jest-environment jsdom */

const { render } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrRow } = require('./PrRow');

const EXPECTED_CELL_CLASSES = [
  'row-select-cell',
  'attention-cell',
  'pr-number-cell',
  // status-cell/approved-cell carry extra modifier classes appended by
  // statusClass()/approvedClass(); startsWith is enough here.
];

describe('PrRow', () => {
  const basePr = { number: '101', title: 'Fix bug', labels: [] };

  const renderRow = (props = {}) =>
    render(
      <table>
        <tbody>
          <PrRow
            entry={{ prNumber: '101', repo: 'owner/repo', section: 'open', data: basePr }}
            pr={basePr}
            repo="owner/repo"
            sectionKey="open"
            isSmartGroup={false}
            lifecycleSection="open"
            actorsMap={{}}
            isExpanded={false}
            isFlagged={false}
            isInReview={false}
            isAcknowledged={false}
            needsAttention={false}
            onToggleInsights={() => {}}
            onCheckboxChange={() => {}}
            onAckAction={() => {}}
            {...props}
          />
        </tbody>
      </table>,
    );

  test('given a PR entry, when rendering, then produces the same 11 columns (in order) as the vanilla table', () => {
    renderRow();
    const mainRow = document.querySelector('tr.pr-row');
    expect(mainRow.children).toHaveLength(11);
    EXPECTED_CELL_CLASSES.forEach((className, index) => {
      expect(mainRow.children[index]).toHaveClass(className);
    });
    expect(mainRow.children[5]).toHaveClass('title-cell');
    expect(mainRow.children[6]).toHaveClass('author-cell');
    expect(mainRow.children[7]).toHaveClass('labels-cell');
    expect(mainRow.children[8]).toHaveClass('check-cell');
    expect(mainRow.children[9]).toHaveClass('date-cell');
    expect(mainRow.children[10]).toHaveClass('actions-cell');
  });

  test('given a PR row, when rendering, then tags it with data-pr-number and data-section-key', () => {
    renderRow();
    const mainRow = document.querySelector('tr.pr-row');
    expect(mainRow).toHaveAttribute('data-pr-number', '101');
    expect(mainRow).toHaveAttribute('data-section-key', 'open');
  });

  test('given isExpanded=false, when rendering, then the insights row is hidden and its cell spans all 11 columns', () => {
    renderRow({ isExpanded: false });
    const insightsRow = document.querySelector('tr.insights-row');
    expect(insightsRow).toHaveAttribute('hidden');
    expect(insightsRow.querySelector('td')).toHaveAttribute('colspan', '11');
  });

  test('given isExpanded=true, when rendering, then the insights row is visible and rendered', () => {
    renderRow({ isExpanded: true });
    const insightsRow = document.querySelector('tr.insights-row');
    expect(insightsRow).not.toHaveAttribute('hidden');
    expect(insightsRow.querySelector('.row-insights-content')).toBeInTheDocument();
  });

  test('given an onViewJson prop, when the {} button is clicked, then it is threaded down to PrActionsCell', () => {
    const onViewJson = jest.fn();
    renderRow({ onViewJson });
    document.querySelector('.row-action-btn.view-json').click();
    expect(onViewJson).toHaveBeenCalledWith({ prNumber: '101', repo: 'owner/repo' }, basePr);
  });
});
