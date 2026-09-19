/** @jest-environment jsdom */

const React = require('react');
const { render } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrDateCell } = require('./PrDateCell');

describe('PrDateCell', () => {
  afterEach(() => {
    delete window.formatIsoDatetime;
    delete window.getManualNotesFieldSummary;
  });

  const defaultFieldSummary = () => ({
    hasCustomComments: false,
    hasOtherNotes: false,
    hasDifficulty: false,
    difficultyLevelText: '',
    hasRallyStories: false,
    hasRallyLinks: false,
    hasAnalysisOfPr: false,
  });

  test('given mergedAt, when rendering, then it wins over closedAt/sourceUpdatedAt as the PR activity line', () => {
    window.formatIsoDatetime = (value) => `fmt(${value})`;
    window.getManualNotesFieldSummary = defaultFieldSummary;
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
    expect(activity).toHaveTextContent('fmt(M)');
    expect(activity).toHaveAttribute('title', 'Merged at');
  });

  test('given no mergedAt, when closedAt is set, then falls back to closedAt with a "Closed at" title', () => {
    window.formatIsoDatetime = (value) => `fmt(${value})`;
    window.getManualNotesFieldSummary = defaultFieldSummary;
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
    expect(activity).toHaveTextContent('fmt(C)');
    expect(activity).toHaveAttribute('title', 'Closed at');
  });

  test('given a baseline, when rendering, then shows the viewer activity line prefixed with "You: "', () => {
    window.formatIsoDatetime = (value) => `fmt(${value})`;
    window.getManualNotesFieldSummary = defaultFieldSummary;
    render(
      <table>
        <tbody>
          <tr>
            <PrDateCell entry={{}} pr={{ baseline: 'B' }} />
          </tr>
        </tbody>
      </table>,
    );
    expect(document.querySelector('.date-cell-viewer-activity')).toHaveTextContent('You: fmt(B)');
  });

  test('given manual-notes field summary flags, when rendering, then marks each indicator filled or empty', () => {
    window.formatIsoDatetime = (value) => String(value || '-');
    window.getManualNotesFieldSummary = () => ({
      hasCustomComments: true,
      hasOtherNotes: false,
      hasDifficulty: true,
      difficultyLevelText: '3',
      hasRallyStories: false,
      hasRallyLinks: false,
      hasAnalysisOfPr: false,
    });
    render(
      <table>
        <tbody>
          <tr>
            <PrDateCell entry={{}} pr={{}} />
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
