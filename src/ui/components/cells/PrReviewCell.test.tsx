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

  describe('assigned users', () => {
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
    });

    test('notes an assignee who is also a requested reviewer', () => {
      renderCell(
        {},
        {
          display: {
            collectAssignedUsers: () => [{ login: 'hubot', name: 'Hubot' }],
            collectRequestedReviewers: () => [{ login: 'hubot', name: 'Hubot' }],
          } as never,
        },
      );
      expect(within(assignedGroup()).getByRole('img', { name: 'Hubot (reviewer)' })).toBeInTheDocument();
    });

    test('shows the viewer when they\'re a requested reviewer but not assigned, and no other reviewers', () => {
      renderCell(
        {},
        {
          identity: { getEffectiveViewerLogin: () => 'octocat' },
          display: {
            collectAssignedUsers: () => [],
            collectRequestedReviewers: () => [
              { login: 'octocat', name: 'The Octocat' },
              { login: 'mona', name: 'Mona' },
            ],
          } as never,
        },
      );
      expect(within(assignedGroup()).getAllByRole('img')).toHaveLength(1);
      expect(within(assignedGroup()).getByRole('img', { name: 'The Octocat (you, reviewer, not assigned)' })).toBeInTheDocument();
    });

    test('shows no assigned group when nobody is assigned', () => {
      renderCell({}, { display: { collectAssignedUsers: () => [], collectRequestedReviewers: () => [{ login: 'mona' }] } as never });
      expect(screen.queryByRole('group', { name: 'Assigned' })).not.toBeInTheDocument();
    });
  });
});
