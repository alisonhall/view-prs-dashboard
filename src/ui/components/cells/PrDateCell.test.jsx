/** @jest-environment jsdom */

const { render } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrDateCell } = require('./PrDateCell');

// getManualNotesFieldSummary is a real, directly-imported function now
// (Phase 7, see REACT_MIGRATION_PLAN.md) - these tests build real entry
// fixtures that drive its actual logic instead of mocking
// window.getManualNotesFieldSummary. An empty entry (as the first 3 tests
// already pass) already produces the real function's all-false shape, so
// those need no fixture changes at all.
describe('PrDateCell', () => {
  test('given mergedAt, when rendering, then it wins over closedAt/sourceUpdatedAt as the PR activity line', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PrDateCell entry={{}} pr={{ mergedAt: 'M', closedAt: 'C', sourceUpdatedAt: 'S' }} />
          </tr>
        </tbody>
      </table>,
    );
    const activity = document.querySelector('.date-cell-pr-activity');
    expect(activity).toHaveTextContent('M');
    expect(activity).toHaveAttribute('title', 'Merged at');
  });

  test('given no mergedAt, when closedAt is set, then falls back to closedAt with a "Closed at" title', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PrDateCell entry={{}} pr={{ closedAt: 'C', sourceUpdatedAt: 'S' }} />
          </tr>
        </tbody>
      </table>,
    );
    const activity = document.querySelector('.date-cell-pr-activity');
    expect(activity).toHaveTextContent('C');
    expect(activity).toHaveAttribute('title', 'Closed at');
  });

  test('given a baseline, when rendering, then shows the viewer activity line prefixed with "You: "', () => {
    render(
      <table>
        <tbody>
          <tr>
            <PrDateCell entry={{}} pr={{ baseline: 'B' }} />
          </tr>
        </tbody>
      </table>,
    );
    expect(document.querySelector('.date-cell-viewer-activity')).toHaveTextContent('You: B');
  });

  test('given manual-notes field summary flags, when rendering, then marks each indicator filled or empty', () => {
    const entry = {
      notes: {
        comments: [{ note: 'a custom comment', author: 'alice' }],
        prDifficulty: '3',
      },
    };
    render(
      <table>
        <tbody>
          <tr>
            <PrDateCell entry={entry} pr={{}} />
          </tr>
        </tbody>
      </table>,
    );
    const indicators = document.querySelectorAll('.author-notes-field-indicator');
    expect(indicators).toHaveLength(6);
    expect(indicators[0]).toHaveClass('author-notes-field-indicator-filled'); // custom comments
    expect(indicators[1]).toHaveClass('author-notes-field-indicator-empty'); // other notes
    expect(indicators[2]).toHaveClass('author-notes-field-indicator-filled', 'author-notes-field-indicator-difficulty');
    expect(indicators[2]).toHaveTextContent('3');
  });
});
