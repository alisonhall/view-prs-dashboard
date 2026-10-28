/** @jest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import type { PrData, PrEntry } from '../../types/pr-data.ts';
import { PrReviewCell } from './PrReviewCell';
import { ActorIdentityContext, defaultActorIdentity, type ActorIdentityValue } from '../../state/ActorIdentityContext';
import {
  PrInsightsDisplayContext,
  defaultPrInsightsDisplay,
  type PrInsightsDisplayValue,
} from '../../state/PrInsightsDisplayContext';

const renderCell = (
  pr: PrData,
  {
    entry = {},
    identity = {},
    display = {},
  }: { entry?: PrEntry; identity?: Partial<ActorIdentityValue>; display?: Partial<PrInsightsDisplayValue> } = {},
) =>
  render(
    <ActorIdentityContext.Provider value={{ ...defaultActorIdentity, ...identity }}>
      <PrInsightsDisplayContext.Provider value={{ ...defaultPrInsightsDisplay, ...display }}>
        <table>
          <tbody>
            <tr>
              <PrReviewCell entry={entry} pr={pr} />
            </tr>
          </tbody>
        </table>
      </PrInsightsDisplayContext.Provider>
    </ActorIdentityContext.Provider>,
  );

describe('PrReviewCell', () => {
  test('shows approvals, green once approved, with the approvers by name in the tooltip', () => {
    renderCell({
      approved: 'YES',
      approvalCount: '2',
      approvers: [
        { login: 'hubot', name: 'Hubot' },
        { login: 'mona', name: 'Mona', approvedAt: '2026-10-20T10:00:00Z' },
      ],
    });
    const approvals = screen.getByRole('img', { name: 'Approved: YES · 2 approvals' });
    expect(approvals.closest('.ui-signal')).toHaveAttribute('data-tone', 'success');
    expect(approvals.closest('.ui-signal')).toHaveTextContent('2');
    // Names only: the insights text adds the login and "at <time>" ("at -" without one).
    expect(approvals.closest('[data-tip]')).toHaveAttribute('data-tip', 'Approved: YES · 2 approvals\nApprovers: Hubot, Mona');
  });

  test('is one keyboard stop whose description lists the whole cell, assignees included', () => {
    renderCell(
      { approved: 'NO', approvalCount: '1', viewedFilesCount: '1', changedFilesCount: '4' },
      { display: { collectAssignedUsers: () => [{ login: 'hubot', name: 'Hubot' }] } as never },
    );
    const group = screen.getByRole('group', { name: 'Review' });
    expect(group).toHaveAttribute('tabindex', '0');
    expect(group).toHaveAccessibleDescription(/^Approved: NO · 1 approval\s+Viewed files: 1 of 4\s+Assigned: Hubot$/);
    // Nothing inside is a keyboard stop of its own.
    expect(group.querySelectorAll('[tabindex]')).toHaveLength(0);
  });

  test('an unapproved PR shows its count without the green', () => {
    renderCell({ approved: 'NO', approvalCount: '0' });
    expect(screen.getByRole('img', { name: 'Approved: NO · 0 approvals' }).closest('.ui-signal')).toHaveAttribute('data-tone', 'muted');
  });

  test('shows open conversations "with you" when that\'s what\'s counted, and nothing at zero', () => {
    renderCell({}, { display: { getOpenConversationCountWithMe: () => ({ count: 2, isViewerSpecific: true }) } as never });
    expect(screen.getByRole('img', { name: '2 open conversations with you' })).toBeInTheDocument();
  });

  test('omits conversations at zero', () => {
    renderCell({}, { display: { getOpenConversationCountWithMe: () => ({ count: 0, isViewerSpecific: false }) } as never });
    expect(screen.queryByRole('img', { name: /open conversation/ })).not.toBeInTheDocument();
  });

  test('shows viewed files, green once all are viewed', () => {
    renderCell({ viewedFilesCount: '3', changedFilesCount: '3' });
    expect(screen.getByRole('img', { name: 'Viewed files: all 3' }).closest('.ui-signal')).toHaveAttribute('data-tone', 'success');
  });

  test('shows the notes icon listing the fields with content', () => {
    renderCell({}, { entry: { notes: { otherNotes: 'Check on mobile', prDifficulty: '2' } } });
    expect(screen.getByRole('img', { name: 'Notes: other notes · difficulty 2' })).toBeInTheDocument();
  });

  describe('assigned users and review requested', () => {
    const assignedGroup = () => screen.getByRole('group', { name: 'Assigned' });

    test('shows each assignee, marking the viewer', () => {
      renderCell(
        {},
        {
          identity: { getEffectiveViewerLogin: () => 'octocat' },
          display: { collectAssignedUsers: () => [{ login: 'octocat', name: 'The Octocat' }, { login: 'hubot', name: 'Hubot' }] } as never,
        },
      );
      expect(within(assignedGroup()).getByRole('img', { name: 'The Octocat (you)' })).toBeInTheDocument();
      expect(within(assignedGroup()).getByRole('img', { name: 'Hubot' })).toBeInTheDocument();
      expect(screen.getByText('TO')).toHaveAttribute('data-viewer', 'true');
      // Labelled on the cell itself, not only in tooltips.
      expect(assignedGroup()).toHaveTextContent(/^Assigned/);
    });

    test('notes an assignee who is also a requested reviewer', () => {
      renderCell(
        {},
        {
          display: {
            collectAssignedUsers: () => [{ login: 'hubot', name: 'Hubot' }],
            collectPendingReviewRequests: () => [{ login: 'hubot', name: 'Hubot' }],
          } as never,
        },
      );
      expect(within(assignedGroup()).getByRole('img', { name: 'Hubot (review requested)' })).toBeInTheDocument();
    });

    test('shows the viewer when they\'re a requested reviewer but not assigned, and no other reviewers', () => {
      renderCell(
        {},
        {
          identity: { getEffectiveViewerLogin: () => 'octocat' },
          display: {
            collectAssignedUsers: () => [],
            collectPendingReviewRequests: () => [
              { login: 'octocat', name: 'The Octocat' },
              { login: 'mona', name: 'Mona' },
            ],
          } as never,
        },
      );
      const requested = screen.getByRole('group', { name: 'Reviewer' });
      expect(requested).toHaveTextContent(/^Reviewer/);
      expect(within(requested).getAllByRole('img')).toHaveLength(1);
      expect(within(requested).getByRole('img', { name: 'The Octocat (you, review requested)' })).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Assigned' })).not.toBeInTheDocument();
    });

    test('lists Assigned before Reviewer, each a label then its avatars, so they line up row to row', () => {
      renderCell(
        {},
        {
          identity: { getEffectiveViewerLogin: () => 'octocat' },
          display: {
            collectAssignedUsers: () => [{ login: 'hubot', name: 'Hubot' }],
            collectPendingReviewRequests: () => [{ login: 'octocat', name: 'The Octocat' }],
          } as never,
        },
      );
      const groups = document.querySelectorAll('.pr-people-group');
      expect(Array.from(groups).map((group) => group.getAttribute('aria-label'))).toEqual(['Assigned', 'Reviewer']);
      groups.forEach((group) => {
        expect(group.children[0]).toHaveClass('pr-people-label');
        expect(group.children[1]).toHaveClass('pr-people-avatars');
        expect(group.children).toHaveLength(2);
      });
    });

    // GitHub drops a request once that person reviews; the broad reviewers
    // list (collectRequestedReviewers) falls back to whoever has reviewed,
    // which must not show you as "Reviewer" here.
    test('does not show "Reviewer" for a PR you have already reviewed, with no request left', () => {
      renderCell(
        { reviews: [{ authorLogin: 'octocat', state: 'APPROVED' }], requestedReviewers: [] },
        { identity: { getEffectiveViewerLogin: () => 'octocat' } },
      );
      expect(screen.queryByRole('group', { name: 'Reviewer' })).not.toBeInTheDocument();
    });

    test("shows no people when nobody is assigned and your review isn't requested", () => {
      renderCell({}, { display: { collectAssignedUsers: () => [], collectPendingReviewRequests: () => [{ login: 'mona' }] } as never });
      expect(screen.queryByRole('group', { name: 'Assigned' })).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Reviewer' })).not.toBeInTheDocument();
    });
  });
});
