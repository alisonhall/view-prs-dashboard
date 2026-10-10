/**
 * PrApprovedCell - Approval summary, assignee initials badges, and open
 * conversation count. Matches vanilla's approved-cell
 * (helpers/pr-approved-cell.helpers.js).
 *
 * @module components/cells/PrApprovedCell
 */

import { useActorIdentity } from '../../state/ActorIdentityContext';
import { usePrInsightsDisplay } from '../../state/PrInsightsDisplayContext';
import { createPrStatusDisplayHelpers } from '../../helpers/pr-status-display.helpers.js';
import { createPrFormattingHelpers } from '../../helpers/pr-formatting.helpers.js';

const { approvedClass } = createPrStatusDisplayHelpers();
const { toCount } = createPrFormattingHelpers();

export function PrApprovedCell({ pr, actorsMap = {} }) {
  const { getEffectiveViewerLogin, resolveActorDisplayName } = useActorIdentity();
  const { collectAssignedUsers, collectRequestedReviewers, getUserInitials, getOpenConversationCountWithMe } =
    usePrInsightsDisplay();

  const assignees = collectAssignedUsers(pr);
  const reviewers = collectRequestedReviewers(pr);
  const currentViewerLogin = String(getEffectiveViewerLogin(pr) || '').trim().toLowerCase();
  const reviewerLogins = new Set(
    reviewers.map((reviewer) => String(reviewer?.login || '').trim().toLowerCase()).filter(Boolean),
  );
  const assigneeLogins = new Set(
    assignees.map((assignee) => String(assignee?.login || '').trim().toLowerCase()).filter(Boolean),
  );
  // Only assignees get a badge - a badge per requested reviewer took up too
  // much space on PRs with a lot of reviewers. The one exception: if the
  // viewer themselves is a requested reviewer but not an assignee, still
  // show a single badge for just them, so there's still a way to tell "I'm
  // reviewing this" from this column without listing every reviewer.
  const viewerReviewerOnly =
    currentViewerLogin && reviewerLogins.has(currentViewerLogin) && !assigneeLogins.has(currentViewerLogin)
      ? reviewers.find(
          (reviewer) => String(reviewer?.login || '').trim().toLowerCase() === currentViewerLogin,
        )
      : null;
  const badgeUsers = viewerReviewerOnly ? [...assignees, viewerReviewerOnly] : assignees;

  const conversationResult = getOpenConversationCountWithMe(pr);
  const openConversationCount = toCount(conversationResult?.count);

  return (
    <td className={['approved-cell', approvedClass(pr?.approved)].filter(Boolean).join(' ')}>
      <div className="approved-cell-summary">
        {pr?.approved || '-'} ({pr?.approvalCount || '0'})
      </div>

      {badgeUsers.length > 0 && (
        <div className="approved-assigned-badges" title="Assigned users">
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
