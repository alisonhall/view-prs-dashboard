/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrApprovedCell } = require('./PrApprovedCell');
const { ActorIdentityContext, defaultActorIdentity } = require('../../state/ActorIdentityContext');
const { PrInsightsDisplayContext, defaultPrInsightsDisplay } = require('../../state/PrInsightsDisplayContext');

const renderCell = (pr, { actorIdentityOverrides = {}, displayOverrides = {} } = {}) =>
  render(
    <ActorIdentityContext.Provider value={{ ...defaultActorIdentity, ...actorIdentityOverrides }}>
      <PrInsightsDisplayContext.Provider value={{ ...defaultPrInsightsDisplay, ...displayOverrides }}>
        <table>
          <tbody>
            <tr>
              <PrApprovedCell pr={pr} />
            </tr>
          </tbody>
        </table>
      </PrInsightsDisplayContext.Provider>
    </ActorIdentityContext.Provider>,
  );

describe('PrApprovedCell', () => {
  test('given an approved PR, when rendering, then shows the approval summary and approvedClass', () => {
    renderCell({ approved: 'YES', approvalCount: '2' });
    expect(document.querySelector('.approved-cell')).toHaveClass('approved-yes');
    expect(document.querySelector('.approved-cell-summary')).toHaveTextContent('YES (2)');
  });

  test('given assignees, when one matches the current viewer, then that badge gets the -me class and title suffix', () => {
    renderCell(
      {},
      {
        actorIdentityOverrides: { getEffectiveViewerLogin: () => 'octocat' },
        displayOverrides: { collectAssignedUsers: () => [{ login: 'octocat', name: 'The Octocat' }] },
      },
    );
    const badge = screen.getByText('TO');
    expect(badge).toHaveClass('approved-assigned-badge', 'approved-assigned-badge-me');
    expect(badge).toHaveAttribute('title', 'The Octocat (you)');
  });

  test('given an assignee who is also a requested reviewer, when rendering, then that badge gets the -reviewer class and title suffix', () => {
    renderCell(
      {},
      {
        displayOverrides: {
          collectAssignedUsers: () => [{ login: 'octocat', name: 'The Octocat' }],
          collectRequestedReviewers: () => [{ login: 'octocat', name: 'The Octocat' }],
        },
      },
    );
    const badge = screen.getByText('TO');
    expect(badge).toHaveClass('approved-assigned-badge', 'approved-assigned-badge-reviewer');
    expect(badge).not.toHaveClass('approved-assigned-badge-me', 'approved-assigned-badge-reviewer-only');
    expect(badge).toHaveAttribute('title', 'The Octocat (reviewer)');
  });

  test('given an assignee who is both the viewer and a requested reviewer, when rendering, then the badge gets both classes and both title suffixes', () => {
    renderCell(
      {},
      {
        actorIdentityOverrides: { getEffectiveViewerLogin: () => 'octocat' },
        displayOverrides: {
          collectAssignedUsers: () => [{ login: 'octocat', name: 'The Octocat' }],
          collectRequestedReviewers: () => [{ login: 'octocat', name: 'The Octocat' }],
        },
      },
    );
    const badge = screen.getByText('TO');
    expect(badge).toHaveClass('approved-assigned-badge-me', 'approved-assigned-badge-reviewer');
    expect(badge).not.toHaveClass('approved-assigned-badge-reviewer-only');
    expect(badge).toHaveAttribute('title', 'The Octocat (you) (reviewer)');
  });

  test('given an assignee who is not a requested reviewer, when rendering, then the badge omits the -reviewer class', () => {
    renderCell(
      {},
      {
        displayOverrides: {
          collectAssignedUsers: () => [{ login: 'octocat', name: 'The Octocat' }],
          collectRequestedReviewers: () => [{ login: 'someone-else', name: 'Someone Else' }],
        },
      },
    );
    const badge = screen.getByText('TO');
    expect(badge).not.toHaveClass('approved-assigned-badge-reviewer');
    expect(badge).toHaveAttribute('title', 'The Octocat');
  });

  // Regression guard for the fix: badges are for assignees only now (a
  // badge per requested reviewer took up too much space) - a non-viewer
  // reviewer who isn't assigned must NOT get a badge.
  test('given a requested reviewer who is not assigned and is not the viewer, when rendering, then no badge is shown at all', () => {
    renderCell(
      {},
      {
        displayOverrides: {
          collectAssignedUsers: () => [],
          collectRequestedReviewers: () => [{ login: 'reviewer-only', name: 'Reviewer Only' }],
        },
      },
    );
    expect(document.querySelector('.approved-assigned-badge')).not.toBeInTheDocument();
    expect(document.querySelector('.approved-assigned-badges')).not.toBeInTheDocument();
  });

  test('given assignees and a separate non-viewer non-assigned reviewer, when rendering, then only the assignee badge is shown', () => {
    renderCell(
      {},
      {
        displayOverrides: {
          collectAssignedUsers: () => [{ login: 'assignee-only', name: 'Assignee Only' }],
          collectRequestedReviewers: () => [{ login: 'reviewer-only', name: 'Reviewer Only' }],
        },
      },
    );
    expect(document.querySelectorAll('.approved-assigned-badge')).toHaveLength(1);
    expect(screen.getByText('AO')).toBeInTheDocument();
    expect(screen.queryByText('RO')).not.toBeInTheDocument();
  });

  // The one exception to "assignees only": the viewer themselves, so
  // there's still a way to tell "I'm reviewing this" without listing every
  // reviewer.
  test('given the viewer is a requested reviewer but not assigned, when rendering, then a badge still shows for just the viewer (not other reviewers)', () => {
    renderCell(
      {},
      {
        actorIdentityOverrides: { getEffectiveViewerLogin: () => 'viewer' },
        displayOverrides: {
          collectAssignedUsers: () => [{ login: 'assignee-only', name: 'Assignee Only' }],
          collectRequestedReviewers: () => [
            { login: 'viewer', name: 'Viewer Name' },
            { login: 'other-reviewer', name: 'Other Reviewer' },
          ],
        },
      },
    );
    expect(document.querySelectorAll('.approved-assigned-badge')).toHaveLength(2);
    const viewerBadge = screen.getByText('VN');
    expect(viewerBadge).toHaveClass('approved-assigned-badge-me', 'approved-assigned-badge-reviewer-only');
    expect(viewerBadge).toHaveAttribute('title', 'Viewer Name (you) (reviewer) (not assigned)');
    expect(screen.queryByText('OR')).not.toBeInTheDocument();
  });

  test('given open conversations with the viewer, when rendering, then shows the "with me" detail', () => {
    renderCell(
      {},
      { displayOverrides: { getOpenConversationCountWithMe: () => ({ count: 3, isViewerSpecific: true }) } },
    );
    expect(document.querySelector('.approved-open-conversations')).toHaveTextContent(
      '3 open conversations with me',
    );
  });

  test('given zero open conversations, when rendering, then omits the conversations detail', () => {
    renderCell(
      {},
      { displayOverrides: { getOpenConversationCountWithMe: () => ({ count: 0, isViewerSpecific: false }) } },
    );
    expect(document.querySelector('.approved-open-conversations')).not.toBeInTheDocument();
  });
});
