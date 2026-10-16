/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrAuthorCell } = require('./PrAuthorCell');

// collectPrAuthors/getManualNotesSummary are real, directly-imported
// functions now (Phase 7, see REACT_MIGRATION_PLAN.md) - these tests build
// real pr/entry fixtures that drive their actual logic instead of mocking
// window.collectPrAuthors/window.getManualNotesSummary. No
// ActorIdentityContext.Provider wrapping is needed: collectPrAuthors is
// built from the Context's own default (viewer-unaware) getPreferredActorKey,
// which resolves a plain login/name key the same way the old inline
// fallback did - exact alias resolution isn't what these tests exercise.
describe('PrAuthorCell', () => {
  test('given an author login, when rendering, then shows the resolved identity name', () => {
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

  test('given a PR author plus a non-merge commit by a different author, when rendering, then both render as identity nodes with the co-author styled distinctly', () => {
    const pr = {
      authorLogin: 'pr-author',
      author: 'PR Author',
      commits: [
        {
          messageHeadline: 'Fix a bug',
          authors: [{ login: 'collab-1', name: 'Collaborator One' }],
        },
      ],
    };
    render(
      <table>
        <tbody>
          <tr>
            <PrAuthorCell entry={{}} pr={pr} />
          </tr>
        </tbody>
      </table>,
    );
    const names = Array.from(document.querySelectorAll('.author-cell-name')).map((node) => node.textContent);
    expect(names).toEqual(['PR Author', 'Collaborator One']);
    expect(document.querySelector('.author-cell-co-author')).toHaveTextContent('Collaborator One');
    expect(document.querySelectorAll('.author-cell-co-author')).toHaveLength(1);
  });

  test('given a commit whose only author is a merge-commit headline, when rendering, then that commit is ignored and only the PR author shows', () => {
    const pr = {
      authorLogin: 'pr-author',
      author: 'PR Author',
      commits: [
        {
          messageHeadline: 'Merge branch main into feature',
          authors: [{ login: 'collab-1', name: 'Collaborator One' }],
        },
      ],
    };
    render(
      <table>
        <tbody>
          <tr>
            <PrAuthorCell entry={{}} pr={pr} />
          </tr>
        </tbody>
      </table>,
    );
    expect(document.querySelector('.author-cell-name')).toHaveTextContent('PR Author');
    expect(document.querySelector('.author-cell-co-author')).not.toBeInTheDocument();
  });

  test('given no author login and no commits, when rendering, then shows a dash and no co-author', () => {
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
    const entry = {
      notes: {
        comments: [{ note: 'first', author: 'alice' }, { note: 'second', author: 'bob' }],
        otherNotes: 'some extra context',
      },
    };
    render(
      <table>
        <tbody>
          <tr>
            <PrAuthorCell entry={entry} pr={{}} />
          </tr>
        </tbody>
      </table>,
    );
    const indicator = screen.getByText('📝 Notes');
    expect(indicator).toHaveClass('author-notes-indicator-has');
    expect(indicator).toHaveAttribute('title', '2 manual comments + other notes');
  });

  test('given no manual notes, when rendering, then shows the empty notes indicator', () => {
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
