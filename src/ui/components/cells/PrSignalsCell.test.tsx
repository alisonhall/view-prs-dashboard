/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { PrSignalsCell, type PrSignalsCellProps } from './PrSignalsCell';

const renderCell = (props: Partial<PrSignalsCellProps> = {}) =>
  render(
    <table>
      <tbody>
        <tr>
          <PrSignalsCell pr={{}} attentionReasons={[]} isFlagged={false} isInReview={false} {...props} />
        </tr>
      </tbody>
    </table>,
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
