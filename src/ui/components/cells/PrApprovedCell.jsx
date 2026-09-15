/**
 * PrApprovedCell - Approval summary, assignee initials badges, and open
 * conversation count. Matches vanilla's approved-cell
 * (helpers/pr-approved-cell.helpers.js).
 *
 * @module components/cells/PrApprovedCell
 */

import React from 'react';

export function PrApprovedCell({ pr, actorsMap = {} }) {
  const approvedClass = window.approvedClass || (() => '');
  const collectAssignedUsers = window.collectAssignedUsers || (() => []);
  const collectRequestedReviewers = window.collectRequestedReviewers || (() => []);
  const getEffectiveViewerLogin = window.getEffectiveViewerLogin || (() => '');
  const resolveActorDisplayName =
    window.resolveActorDisplayName || ((login, _actorsMap, fallback) => String(fallback || login || '').trim());
  const getUserInitials = window.getUserInitials || ((name, login) => String(name || login || '').slice(0, 2));
  const getOpenConversationCountWithMe = window.getOpenConversationCountWithMe || (() => ({ count: 0, isViewerSpecific: false }));
  const toCount = window.toCount || ((value) => Number.parseInt(value, 10) || 0);

  const assignees = collectAssignedUsers(pr);
  const reviewers = collectRequestedReviewers(pr);
  const currentViewerLogin = String(getEffectiveViewerLogin(pr) || '').trim().toLowerCase();
  const reviewerLogins = new Set(
    reviewers.map((reviewer) => String(reviewer?.login || '').trim().toLowerCase()).filter(Boolean),
  );
  const assigneeLogins = new Set(
    assignees.map((assignee) => String(assignee?.login || '').trim().toLowerCase()).filter(Boolean),
  );
  // Show a badge for every assignee, plus any requested reviewer who isn't
  // already an assignee - so the reviewer indicator is visible even for
  // people who are reviewing but not assigned.
  const badgeUsers = [
    ...assignees,
    ...reviewers.filter((reviewer) => {
      const login = String(reviewer?.login || '').trim().toLowerCase();
      return login && !assigneeLogins.has(login);
    }),
  ];

  const conversationResult = getOpenConversationCountWithMe(pr);
  const openConversationCount = toCount(conversationResult?.count);

  return (
    <td className={['approved-cell', approvedClass(pr?.approved)].filter(Boolean).join(' ')}>
      <div className="approved-cell-summary">
        {pr?.approved || '-'} ({pr?.approvalCount || '0'})
      </div>

      {badgeUsers.length > 0 && (
        <div className="approved-assigned-badges" title="Assigned users and reviewers">
          {badgeUsers.map((badgeUser) => {
            const login = String(badgeUser?.login || '').trim();
            if (!login) return null;
            const isAssignedToViewer = Boolean(currentViewerLogin) && login.toLowerCase() === currentViewerLogin;
            const isReviewer = reviewerLogins.has(login.toLowerCase());
            const isAssigned = assigneeLogins.has(login.toLowerCase());
            const displayName = resolveActorDisplayName(login, actorsMap, badgeUser?.name);
            return (
              <span
                key={login}
                className={[
                  'approved-assigned-badge',
                  isAssignedToViewer ? 'approved-assigned-badge-me' : '',
                  isReviewer ? 'approved-assigned-badge-reviewer' : '',
                  isReviewer && !isAssigned ? 'approved-assigned-badge-reviewer-only' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={`${displayName}${isAssignedToViewer ? ' (you)' : ''}${isReviewer ? ' (reviewer)' : ''}${!isAssigned ? ' (not assigned)' : ''}`}
              >
                {getUserInitials(displayName, login)}
              </span>
            );
          })}
        </div>
      )}

      {openConversationCount > 0 && (
        <div className="approved-cell-detail approved-open-conversations">
          {openConversationCount} open conversation{openConversationCount === 1 ? '' : 's'}
          {conversationResult?.isViewerSpecific ? ' with me' : ''}
        </div>
      )}
    </td>
  );
}
