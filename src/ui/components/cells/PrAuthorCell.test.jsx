/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrAuthorCell } = require('./PrAuthorCell');

describe('PrAuthorCell', () => {
  afterEach(() => {
    delete window.getPreferredActorKey;
    delete window.getManualNotesSummary;
    delete window.normalizeActorLogin;
    delete window.getEffectiveViewerLogin;
    delete window.resolveActorDisplayName;
  });

  test('given an author login, when rendering, then shows the resolved identity name', () => {
    window.getPreferredActorKey = (login) => login;
    window.resolveActorDisplayName = (_login, _actorsMap, fallback) => fallback || 'Octocat';
    window.getManualNotesSummary = () => ({ hasNotes: false, commentsCount: 0, hasOtherNotes: false });
    render(
      <table>
        <tbody>
          <tr>
            <PrAuthorCell entry={{}} pr={{ authorLogin: 'octocat', author: 'Octocat' }} />
          </tr>
        </tbody>
      </table>,
    );
    expect(document.querySelector('.author-cell-name')).toHaveTextContent('Octocat');
  });

  test('given no author login, when rendering, then shows a dash', () => {
    window.getPreferredActorKey = () => '';
    window.getManualNotesSummary = () => ({ hasNotes: false, commentsCount: 0, hasOtherNotes: false });
    render(
      <table>
        <tbody>
          <tr>
            <PrAuthorCell entry={{}} pr={{}} />
          </tr>
        </tbody>
      </table>,
    );
    expect(document.querySelector('.author-cell-name')).toHaveTextContent('-');
  });

  test('given manual notes present, when rendering, then shows the filled notes indicator with a count title', () => {
    window.getPreferredActorKey = () => '';
    window.getManualNotesSummary = () => ({ hasNotes: true, commentsCount: 2, hasOtherNotes: true });
    render(
      <table>
        <tbody>
          <tr>
            <PrAuthorCell entry={{}} pr={{}} />
          </tr>
        </tbody>
      </table>,
    );
    const indicator = screen.getByText('📝 Notes');
    expect(indicator).toHaveClass('author-notes-indicator-has');
    expect(indicator).toHaveAttribute('title', '2 manual comments + other notes');
  });

  test('given no manual notes, when rendering, then shows the empty notes indicator', () => {
    window.getPreferredActorKey = () => '';
    window.getManualNotesSummary = () => ({ hasNotes: false, commentsCount: 0, hasOtherNotes: false });
    render(
      <table>
        <tbody>
          <tr>
            <PrAuthorCell entry={{}} pr={{}} />
          </tr>
        </tbody>
      </table>,
    );
    expect(document.querySelector('.author-notes-indicator')).toHaveClass('author-notes-indicator-none');
    expect(document.querySelector('.author-notes-indicator')).toHaveAttribute(
      'title',
      'No manual comments or notes',
    );
  });
});
