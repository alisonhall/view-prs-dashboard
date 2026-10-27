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
 * On a line under the slots, labelled so they read without hovering:
 * "Assigned" and the assigned users' avatars, as the old Approved column
 * showed; and "Review requested" with the viewer's, when their review is
 * requested but they aren't assigned, so "I'm reviewing this" stays
 * visible.
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
  const { collectAssignedUsers, collectPendingReviewRequests, getUserInitials, getOpenConversationCountWithMe } =
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
  // Outstanding requests only: the fallback to whoever has reviewed would
  // label them "review requested" too.
  const reviewers = collectPendingReviewRequests(pr);
  const loginOf = (person: { login?: unknown }) => String(person?.login || '').trim();
  const assigneeLogins = new Set(assignees.map((person) => loginOf(person).toLowerCase()).filter(Boolean));
  const reviewerLogins = new Set(reviewers.map((person) => loginOf(person).toLowerCase()).filter(Boolean));
  const viewerReviewerOnly =
    viewerLogin && reviewerLogins.has(viewerLogin) && !assigneeLogins.has(viewerLogin)
      ? reviewers.find((person) => loginOf(person).toLowerCase() === viewerLogin)
      : undefined;
  const toPerson = (person: { login?: unknown; name?: string }): Person => {
    const login = loginOf(person);
    const key = login.toLowerCase();
    const displayName = resolveActorDisplayName(login, actorsMap, person.name) || login;
    const roles = [key === viewerLogin ? 'you' : '', reviewerLogins.has(key) ? 'review requested' : ''].filter(Boolean);
    return {
      login,
      displayName,
      isViewer: Boolean(viewerLogin) && key === viewerLogin,
      label: roles.length ? `${displayName} (${roles.join(', ')})` : displayName,
    };
  };
  const assigned = assignees.map(toPerson).filter((person) => person.login);
  const requested = viewerReviewerOnly ? [toPerson(viewerReviewerOnly)].filter((person) => person.login) : [];

  const summary = [
    approvalsLabel,
    openCount > 0 ? conversationsLabel : '',
    viewedFiles?.label || '',
    notes || '',
    assigned.length ? `Assigned: ${assigned.map((person) => person.label).join(', ')}` : '',
    requested.length ? `Review requested: ${requested.map((person) => person.label).join(', ')}` : '',
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
        {(assigned.length > 0 || requested.length > 0) && (
          <span className="pr-review-people">
            {assigned.length > 0 && <PeopleGroup label="Assigned" people={assigned} getUserInitials={getUserInitials} />}
            {requested.length > 0 && (
              <PeopleGroup label="Review requested" people={requested} getUserInitials={getUserInitials} />
            )}
          </span>
        )}
      </SignalGroup>
    </td>
  );
}

interface Person {
  login: string;
  displayName: string;
  isViewer: boolean;
  // The name and roles ("you", "review requested"), for the tooltip.
  label: string;
}

// One labelled group of avatars ("Assigned", "Review requested"), so what
// the badges mean shows without hovering; each names its person on hover.
function PeopleGroup({
  label,
  people,
  getUserInitials,
}: {
  label: string;
  people: Person[];
  getUserInitials: (name: string, login: string) => string;
}) {
  return (
    <span className="pr-people-group" role="group" aria-label={label}>
      <span className="pr-people-label" aria-hidden="true">
        {label}
      </span>
      {people.map((person) => (
        <span key={person.login} role="img" aria-label={person.label} data-tip={person.label} data-tip-on="hover">
          <Avatar initials={getUserInitials(person.displayName, person.login)} login={person.login} isViewer={person.isViewer} size="sm" />
        </span>
      ))}
    </span>
  );
}
