/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrApprovedCell } = require('./PrApprovedCell');
const { ActorIdentityContext, defaultActorIdentity } = require('../../state/ActorIdentityContext');

const renderCell = (pr, actorIdentityOverrides = {}) =>
  render(
    <ActorIdentityContext.Provider value={{ ...defaultActorIdentity, ...actorIdentityOverrides }}>
      <table>
        <tbody>
          <tr>
            <PrApprovedCell pr={pr} />
          </tr>
        </tbody>
      </table>
    </ActorIdentityContext.Provider>,
  );

describe('PrApprovedCell', () => {
  afterEach(() => {
    delete window.collectAssignedUsers;
    delete window.collectRequestedReviewers;
    delete window.getUserInitials;
    delete window.getOpenConversationCountWithMe;
  });

  test('given an approved PR, when rendering, then shows the approval summary and approvedClass', () => {
    renderCell({ approved: 'YES', approvalCount: '2' });
    expect(document.querySelector('.approved-cell')).toHaveClass('approved-yes');
    expect(document.querySelector('.approved-cell-summary')).toHaveTextContent('YES (2)');
  });

  test('given assignees, when one matches the current viewer, then that badge gets the -me class and title suffix', () => {
    window.collectAssignedUsers = () => [{ login: 'octocat', name: 'The Octocat' }];
    window.getUserInitials = (name) => name.slice(0, 2).toUpperCase();
    renderCell({}, { getEffectiveViewerLogin: () => 'octocat' });
    const badge = screen.getByText('TH');
    expect(badge).toHaveClass('approved-assigned-badge', 'approved-assigned-badge-me');
    expect(badge).toHaveAttribute('title', 'The Octocat (you)');
  });

  test('given an assignee who is also a requested reviewer, when rendering, then that badge gets the -reviewer class and title suffix', () => {
    window.collectAssignedUsers = () => [{ login: 'octocat', name: 'The Octocat' }];
    window.collectRequestedReviewers = () => [{ login: 'octocat', name: 'The Octocat' }];
    window.getUserInitials = (name) => name.slice(0, 2).toUpperCase();
    renderCell({});
    const badge = screen.getByText('TH');
    expect(badge).toHaveClass('approved-assigned-badge', 'approved-assigned-badge-reviewer');
    expect(badge).not.toHaveClass('approved-assigned-badge-me', 'approved-assigned-badge-reviewer-only');
    expect(badge).toHaveAttribute('title', 'The Octocat (reviewer)');
  });

  test('given an assignee who is both the viewer and a requested reviewer, when rendering, then the badge gets both classes and both title suffixes', () => {
    window.collectAssignedUsers = () => [{ login: 'octocat', name: 'The Octocat' }];
    window.collectRequestedReviewers = () => [{ login: 'octocat', name: 'The Octocat' }];
    window.getUserInitials = (name) => name.slice(0, 2).toUpperCase();
    renderCell({}, { getEffectiveViewerLogin: () => 'octocat' });
    const badge = screen.getByText('TH');
    expect(badge).toHaveClass('approved-assigned-badge-me', 'approved-assigned-badge-reviewer');
    expect(badge).not.toHaveClass('approved-assigned-badge-reviewer-only');
    expect(badge).toHaveAttribute('title', 'The Octocat (you) (reviewer)');
  });

  test('given an assignee who is not a requested reviewer, when rendering, then the badge omits the -reviewer class', () => {
    window.collectAssignedUsers = () => [{ login: 'octocat', name: 'The Octocat' }];
    window.collectRequestedReviewers = () => [{ login: 'someone-else', name: 'Someone Else' }];
    window.getUserInitials = (name) => name.slice(0, 2).toUpperCase();
    renderCell({});
    const badge = screen.getByText('TH');
    expect(badge).not.toHaveClass('approved-assigned-badge-reviewer');
    expect(badge).toHaveAttribute('title', 'The Octocat');
  });

  // Regression guard for the fix: badges are for assignees only now (a
  // badge per requested reviewer took up too much space) - a non-viewer
  // reviewer who isn't assigned must NOT get a badge.
  test('given a requested reviewer who is not assigned and is not the viewer, when rendering, then no badge is shown at all', () => {
    window.collectAssignedUsers = () => [];
    window.collectRequestedReviewers = () => [{ login: 'reviewer-only', name: 'Reviewer Only' }];
    window.getUserInitials = (name) => name.slice(0, 2).toUpperCase();
    renderCell({});
    expect(document.querySelector('.approved-assigned-badge')).not.toBeInTheDocument();
    expect(document.querySelector('.approved-assigned-badges')).not.toBeInTheDocument();
  });

  test('given assignees and a separate non-viewer non-assigned reviewer, when rendering, then only the assignee badge is shown', () => {
    window.collectAssignedUsers = () => [{ login: 'assignee-only', name: 'Assignee Only' }];
    window.collectRequestedReviewers = () => [{ login: 'reviewer-only', name: 'Reviewer Only' }];
    window.getUserInitials = (name) => name.slice(0, 2).toUpperCase();
    renderCell({});
    expect(document.querySelectorAll('.approved-assigned-badge')).toHaveLength(1);
    expect(screen.getByText('AS')).toBeInTheDocument();
    expect(screen.queryByText('RE')).not.toBeInTheDocument();
  });

  // The one exception to "assignees only": the viewer themselves, so
  // there's still a way to tell "I'm reviewing this" without listing every
  // reviewer.
  test('given the viewer is a requested reviewer but not assigned, when rendering, then a badge still shows for just the viewer (not other reviewers)', () => {
    window.collectAssignedUsers = () => [{ login: 'assignee-only', name: 'Assignee Only' }];
    window.collectRequestedReviewers = () => [
      { login: 'viewer', name: 'Viewer Name' },
      { login: 'other-reviewer', name: 'Other Reviewer' },
    ];
    window.getUserInitials = (name) => name.slice(0, 2).toUpperCase();
    renderCell({}, { getEffectiveViewerLogin: () => 'viewer' });
    expect(document.querySelectorAll('.approved-assigned-badge')).toHaveLength(2);
    const viewerBadge = screen.getByText('VI');
    expect(viewerBadge).toHaveClass('approved-assigned-badge-me', 'approved-assigned-badge-reviewer-only');
    expect(viewerBadge).toHaveAttribute('title', 'Viewer Name (you) (reviewer) (not assigned)');
    expect(screen.queryByText('OT')).not.toBeInTheDocument();
  });

  test('given open conversations with the viewer, when rendering, then shows the "with me" detail', () => {
    window.getOpenConversationCountWithMe = () => ({ count: 3, isViewerSpecific: true });
    renderCell({});
    expect(document.querySelector('.approved-open-conversations')).toHaveTextContent(
      '3 open conversations with me',
    );
  });

  test('given zero open conversations, when rendering, then omits the conversations detail', () => {
    window.getOpenConversationCountWithMe = () => ({ count: 0, isViewerSpecific: false });
    renderCell({});
    expect(document.querySelector('.approved-open-conversations')).not.toBeInTheDocument();
  });
});
