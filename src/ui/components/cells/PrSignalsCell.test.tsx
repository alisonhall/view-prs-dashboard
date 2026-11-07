/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { PrSignalsCell, type PrSignalsCellProps } from './PrSignalsCell';
import { NowContext } from '../../state/NowContext';
import { PrDataContext, type PrDataValue } from '../../state/PrDataContext';
import type { PrDataPayload } from '../../types/pr-data.ts';

const NOW = Date.parse('2026-10-24T12:00:00Z');

const renderCell = (props: Partial<PrSignalsCellProps> = {}, payload: PrDataPayload = {}) =>
  render(
    <PrDataContext.Provider value={{ payload } as unknown as PrDataValue}>
      <NowContext.Provider value={NOW}>
        <table>
          <tbody>
            <tr>
              <PrSignalsCell pr={{}} repo="o/r" attentionReasons={[]} isFlagged={false} isInReview={false} {...props} />
            </tr>
          </tbody>
        </table>
      </NowContext.Provider>
    </PrDataContext.Provider>,
  );

const slotCount = () => document.querySelector('.pr-signal-slots')?.children.length;

describe('PrSignalsCell', () => {
  test('always has four slots, empty ones included, so rows line up', () => {
    renderCell();
    expect(slotCount()).toBe(4);
    expect(screen.queryAllByRole('img')).toHaveLength(0);

    renderCell({ pr: { status: 'CHANGED' }, attentionReasons: ['New commits'], isFlagged: true, isInReview: true });
    expect(document.querySelectorAll('.pr-signal-slots')[1]?.children.length).toBe(4);
  });

  test('a changed PR shows the unread dot, saying what changed even when it needs no attention', () => {
    renderCell({ pr: { status: 'CHANGED', reason: 'commit|review' }, attentionReasons: [] });
    const dot = screen.getByRole('img', { name: 'Changed since your last ack' });
    expect(dot.closest('[data-tip]')).toHaveAttribute('data-tip', 'Changed since your last ack\nNew commits\nNew reviews');
  });

  describe('what changed since you last looked', () => {
    const changed = {
      number: '7',
      status: 'CHANGED',
      reason: 'commit|review|unanswered-thread',
      baseline: '2026-10-22T12:00:00Z',
      activityEvents: [
        { sourceId: 'c2', occurredAt: '2026-10-24T09:00:00Z', actor: 'ann', type: 'commit', channel: 'commit' },
        { sourceId: 'r1', occurredAt: '2026-10-23T15:00:00Z', actor: 'sam', type: 'review', channel: 'review', state: 'CHANGES_REQUESTED' },
        { sourceId: 'c1', occurredAt: '2026-10-23T09:00:00Z', actor: 'ann', type: 'commit', channel: 'commit' },
        { sourceId: 'old', occurredAt: '2026-10-21T09:00:00Z', actor: 'ann', type: 'commit', channel: 'commit' },
      ],
    };

    test('says since when and counts what is new, in place of the reasons the counts say', () => {
      renderCell({ pr: changed, actorsMap: { sam: 'Sam Lee' } });
      const dot = screen.getByRole('img', { name: 'Changed since your last activity on Oct 22' });
      expect(dot.closest('[data-tip]')).toHaveAttribute(
        'data-tip',
        'Changed since your last activity on Oct 22\n2 commits · 1 review (changes requested by Sam Lee)\nUnanswered review threads',
      );
    });

    test('from your Ack when it is later than your last activity', () => {
      renderCell({ pr: changed }, { ackByRepo: { 'o/r': { '7': '2026-10-23T12:00:00Z' } } });
      const dot = screen.getByRole('img', { name: 'Changed since you acked on Oct 23' });
      expect(dot.closest('[data-tip]')?.getAttribute('data-tip')).toMatch(/\n1 commit · 1 review \(changes requested by sam\)\n/);
    });

    test("an Ack taken back still counts as when you looked (it's in the history)", () => {
      renderCell({ pr: changed }, { ackHistoryByRepo: { 'o/r': { '7': ['2026-10-23T12:00:00Z'] } } });
      expect(screen.getByRole('img', { name: 'Changed since you acked on Oct 23' })).toBeInTheDocument();
    });
  });

  test('a changed PR without reason tokens just says it changed', () => {
    renderCell({ pr: { status: 'CHANGED', reason: '-' } });
    expect(screen.getByRole('img', { name: 'Changed since your last ack' }).closest('[data-tip]')).toHaveAttribute(
      'data-tip',
      'Changed since your last ack',
    );
  });

  test('is one keyboard stop listing every signal; the icons themselves aren\'t stops', () => {
    renderCell({ pr: { status: 'CHANGED', reason: 'commit' }, isFlagged: true });
    const group = screen.getByRole('group', { name: 'Signals' });
    expect(group).toHaveAttribute('tabindex', '0');
    expect(group).toHaveAccessibleDescription(/^Changed since your last ack\s+New commits\s+Flagged$/);
    expect(group.querySelectorAll('[tabindex]')).toHaveLength(0);
  });

  test('with no signals it isn\'t a keyboard stop', () => {
    renderCell();
    expect(screen.getByRole('group', { name: 'Signals' })).not.toHaveAttribute('tabindex');
  });

  test('a PR with no recent activity shows a ring instead', () => {
    renderCell({ pr: { status: 'NO_ACTIVITY' } });
    expect(screen.getByRole('img', { name: 'No recent activity' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Changed since your last ack' })).not.toBeInTheDocument();
  });

  test('any other status is named, so none goes unshown; NO_CHANGE shows nothing', () => {
    renderCell({ pr: { status: 'NO_LOCAL_DATA' } });
    expect(screen.getByRole('img', { name: 'Status: NO_LOCAL_DATA' })).toBeInTheDocument();
  });

  test('NO_CHANGE leaves the change slot empty', () => {
    renderCell({ pr: { status: 'NO_CHANGE' } });
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  test('needs attention lists its reasons, in its own tooltip and the cell\'s description', () => {
    renderCell({ attentionReasons: ['New commits', '1 unsubmitted pending comment'] });
    const icon = screen.getByRole('img', { name: 'Needs attention' });
    expect(icon.closest('[data-tip]')).toHaveAttribute('data-tip', 'Needs attention\nNew commits\n1 unsubmitted pending comment');
    expect(screen.getByRole('group', { name: 'Signals' })).toHaveAccessibleDescription(
      /^Needs attention\s+New commits\s+1 unsubmitted pending comment$/,
    );
  });

  test('shows Flagged and In review', () => {
    renderCell({ isFlagged: true, isInReview: true });
    expect(screen.getByRole('img', { name: 'Flagged' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'In review' })).toBeInTheDocument();
  });
});
