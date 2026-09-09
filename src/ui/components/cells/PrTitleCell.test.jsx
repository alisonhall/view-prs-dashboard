/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrTitleCell } = require('./PrTitleCell');

describe('PrTitleCell', () => {
  afterEach(() => {
    delete window.formatTitleWithIcons;
    delete window.countPendingThreadComments;
  });

  const renderCell = (props) =>
    render(
      <table>
        <tbody>
          <tr>
            <PrTitleCell pr={{ number: '101' }} sectionKey="flagged" onToggleInsights={() => {}} {...props} />
          </tr>
        </tbody>
      </table>,
    );

  test('given a title, when rendering, then shows the formatted title text', () => {
    window.formatTitleWithIcons = (_titleDisplay, title) => `✅ ${title}`;
    renderCell({ pr: { number: '101', title: 'Fix bug' } });
    expect(document.querySelector('.title-text')).toHaveTextContent('✅ Fix bug');
  });

  test('given a smart group with a lifecycle section, when rendering, then shows the matching lifecycle badge', () => {
    renderCell({ isSmartGroup: true, lifecycleSection: 'merged' });
    expect(screen.getByText('Merged')).toHaveClass('lifecycle-badge', 'lifecycle-badge-merged');
  });

  test('given a lifecycle-section render (not a smart group), when rendering, then shows no lifecycle badge', () => {
    renderCell({ isSmartGroup: false, lifecycleSection: 'merged' });
    expect(document.querySelector('.lifecycle-badge')).not.toBeInTheDocument();
  });

  test('given a non-main target branch, when rendering, then shows the target branch note', () => {
    renderCell({ pr: { number: '101', targetBranch: 'release/2.0' } });
    expect(screen.getByText('Target branch: release/2.0')).toHaveClass('insight-subtle');
  });

  test('given a main target branch, when rendering, then omits the target branch note', () => {
    renderCell({ pr: { number: '101', targetBranch: 'main' } });
    expect(document.querySelector('.insight-subtle')).not.toBeInTheDocument();
  });

  test('given isExpanded is false, when rendering, then the toggle reads "More insights"', () => {
    renderCell({ isExpanded: false });
    expect(screen.getByRole('button')).toHaveTextContent('More insights');
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  test('given isExpanded is true, when rendering, then the toggle reads "Hide insights"', () => {
    renderCell({ isExpanded: true });
    expect(screen.getByRole('button')).toHaveTextContent('Hide insights');
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  test('given a toggle click, when clicked, then onToggleInsights is called with the PR number and section', () => {
    const onToggleInsights = jest.fn();
    renderCell({ pr: { number: '101' }, sectionKey: 'open', onToggleInsights });
    screen.getByRole('button').click();
    expect(onToggleInsights).toHaveBeenCalledWith('101', 'open');
  });

  test('given pending comments, when rendering, then shows the pending-comments chip', () => {
    window.countPendingThreadComments = () => 3;
    renderCell({});
    expect(screen.getByText('Pending comments: 3')).toHaveClass('row-pending-comments-chip');
  });
});
