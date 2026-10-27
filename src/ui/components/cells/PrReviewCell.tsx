import type { PrApprover, PrData, PrEntry } from '../../types/pr-data.ts';
import { useActorIdentity } from '../../state/ActorIdentityContext';
import { usePrInsightsDisplay } from '../../state/PrInsightsDisplayContext';
import { describeNotes, describeViewedFiles } from '../../helpers/pr-row-signals.helpers.ts';
import { Avatar } from '../ui/Avatar';
import { EmptySignal, Signal, SignalGroup } from '../ui/Signal';
import { useTooltipController } from '../ui/Tooltip';
import type { ActorsMap } from '../../helpers/pr-actor-identity.helpers.ts';

const toCount = (value: unknown): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

/**
 * The Review column, in fixed slots:
 * 1. Approvals (green once approved), with the approvers in the tooltip.
 * 2. Open conversations (with you, when that's what's counted).
 * 3. Viewed files.
 * 4. Notes, listing the fields that have content.
 *
 * After the slots: avatars of the assigned users, as the old Approved
 * column showed. The viewer also gets one when they're a requested
 * reviewer but not assigned, so "I'm reviewing this" stays visible.
 *
 * The cell is one keyboard stop (SignalGroup) whose focus tooltip lists
 * all of it; each icon and avatar also has its own tooltip on hover.
 */
export interface PrReviewCellProps {
  entry: PrEntry;
  pr: PrData;
  actorsMap?: ActorsMap;
}

export function PrReviewCell({ entry, pr, actorsMap = {} }: PrReviewCellProps) {
  useTooltipController();
  const { getEffectiveViewerLogin, resolveActorDisplayName } = useActorIdentity();
  const { collectAssignedUsers, collectRequestedReviewers, getUserInitials, getOpenConversationCountWithMe } =
    usePrInsightsDisplay();

  const approved = String(pr?.approved || '').toUpperCase() === 'YES';
  const approvalCount = toCount(pr?.approvalCount);
  const approverNames = (Array.isArray(pr?.approvers) ? pr.approvers : [])
    .map((approver: PrApprover) => {
      const login = String(approver?.login || '').trim();
      return resolveActorDisplayName(login, actorsMap, approver?.name) || login;
    })
    .filter(Boolean);
  const approvalsLabel = [
    `Approved: ${approved ? 'YES' : 'NO'} · ${approvalCount} approval${approvalCount === 1 ? '' : 's'}`,
    approverNames.length ? `Approvers: ${approverNames.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const conversations = getOpenConversationCountWithMe(pr);
  const openCount = toCount(conversations?.count);
  const conversationsLabel = `${openCount} open conversation${openCount === 1 ? '' : 's'}${conversations?.isViewerSpecific ? ' with you' : ''}`;

  const viewedFiles = describeViewedFiles(pr);
  const notes = describeNotes(entry, pr);

  const viewerLogin = String(getEffectiveViewerLogin(pr) || '').trim().toLowerCase();
  const assignees = collectAssignedUsers(pr);
  const reviewers = collectRequestedReviewers(pr);
  const loginOf = (person: { login?: unknown }) => String(person?.login || '').trim();
  const assigneeLogins = new Set(assignees.map((person) => loginOf(person).toLowerCase()).filter(Boolean));
  const reviewerLogins = new Set(reviewers.map((person) => loginOf(person).toLowerCase()).filter(Boolean));
  const viewerReviewerOnly =
    viewerLogin && reviewerLogins.has(viewerLogin) && !assigneeLogins.has(viewerLogin)
      ? reviewers.find((person) => loginOf(person).toLowerCase() === viewerLogin)
      : undefined;
  const people = (viewerReviewerOnly ? [...assignees, viewerReviewerOnly] : assignees)
    .map((person) => {
      const login = loginOf(person);
      const key = login.toLowerCase();
      const displayName = resolveActorDisplayName(login, actorsMap, (person as { name?: string }).name) || login;
      const roles = [
        key === viewerLogin ? 'you' : '',
        reviewerLogins.has(key) ? 'reviewer' : '',
        assigneeLogins.has(key) ? '' : 'not assigned',
      ].filter(Boolean);
      return {
        login,
        displayName,
        isViewer: Boolean(viewerLogin) && key === viewerLogin,
        label: roles.length ? `${displayName} (${roles.join(', ')})` : displayName,
      };
    })
    .filter((person) => person.login);

  const summary = [
    approvalsLabel,
    openCount > 0 ? conversationsLabel : '',
    viewedFiles?.label || '',
    notes || '',
    people.length ? `Assigned: ${people.map((person) => person.label).join(', ')}` : '',
  ].filter(Boolean);

  return (
    <td className="pr-cell pr-cell-review">
      <SignalGroup label="Review" summary={summary}>
        <span className="pr-signal-slots pr-review-slots">
          <Signal icon="approve" tone={approved ? 'success' : 'muted'} text={String(approvalCount)} label={approvalsLabel} size={14} inGroup />
          {openCount > 0 ? (
            <Signal icon="chat" tone="attention" text={String(openCount)} label={conversationsLabel} size={14} inGroup />
          ) : (
            <EmptySignal />
          )}
          {viewedFiles ? (
            <Signal icon="fileViewed" tone={viewedFiles.tone} text={viewedFiles.text} label={viewedFiles.label} size={14} inGroup />
          ) : (
            <EmptySignal />
          )}
          {notes ? <Signal icon="note" label={notes} size={14} inGroup /> : <EmptySignal />}
        </span>
        {people.length > 0 && (
          <span className="pr-assignees" role="group" aria-label="Assigned">
            {people.map((person) => (
              <span key={person.login} role="img" aria-label={person.label} data-tip={person.label} data-tip-on="hover">
                <Avatar initials={getUserInitials(person.displayName, person.login)} login={person.login} isViewer={person.isViewer} size="sm" />
              </span>
            ))}
          </span>
        )}
      </SignalGroup>
    </td>
  );
}
