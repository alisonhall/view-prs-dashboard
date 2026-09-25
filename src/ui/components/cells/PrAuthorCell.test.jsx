/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrAuthorCell } = require('./PrAuthorCell');

describe('PrAuthorCell', () => {
  afterEach(() => {
    delete window.getPreferredActorKey;
    delete window.collectPrAuthors;
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

  test('given collectPrAuthors returns the PR author plus commit co-authors, when rendering, then all render as identity nodes with the co-author(s) styled distinctly', () => {
    window.collectPrAuthors = () => [
      { key: 'pr-author', name: 'PR Author', isPrimary: true },
      { key: 'collab-1', name: 'Collaborator One', isPrimary: false },
    ];
    window.resolveActorDisplayName = (_login, _actorsMap, fallback) => fallback;
    window.getManualNotesSummary = () => ({ hasNotes: false, commentsCount: 0, hasOtherNotes: false });
    render(
      <table>
        <tbody>
          <tr>
            <PrAuthorCell entry={{}} pr={{ authorLogin: 'pr-author', author: 'PR Author' }} />
          </tr>
        </tbody>
      </table>,
    );
    const names = Array.from(document.querySelectorAll('.author-cell-name')).map((node) => node.textContent);
    expect(names).toEqual(['PR Author', 'Collaborator One']);
    expect(document.querySelector('.author-cell-co-author')).toHaveTextContent('Collaborator One');
    expect(document.querySelectorAll('.author-cell-co-author')).toHaveLength(1);
  });

  test('given collectPrAuthors returns an empty array, when rendering, then shows a dash', () => {
    window.collectPrAuthors = () => [];
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
    expect(document.querySelector('.author-cell-co-author')).not.toBeInTheDocument();
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
