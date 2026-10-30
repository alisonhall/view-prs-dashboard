/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { NOW_TICK_MS, NowProvider } from '../../state/NowContext';
import { PrChecksCell } from './PrChecksCell';
import { PrActivityCell, PrSizeCell } from './PrSizeActivityCells';

const inRow = (cell: ReactNode) =>
  render(
    <table>
      <tbody>
        <tr>{cell}</tr>
      </tbody>
    </table>,
  );

const descriptionOf = (element: Element | null) => {
  const id = element?.closest('.ui-tooltip-target')?.getAttribute('aria-describedby') || '';
  return document.getElementById(id)?.textContent;
};

describe('PrChecksCell', () => {
  test('shows checks and mergeability, explained, as one keyboard stop listing both', () => {
    inRow(<PrChecksCell pr={{ checkState: 'FAIL', mergeState: 'UNK' }} />);
    expect(screen.getByRole('img', { name: 'Checks: FAIL' })).toBeInTheDocument();
    const mergeable = screen.getByRole('img', { name: 'Mergeable: UNK' });
    expect(mergeable.closest('[data-tip]')).toHaveAttribute('data-tip', "Mergeable: UNK\nGitHub hasn't computed it yet");

    const group = screen.getByRole('group', { name: 'Checks and mergeability' });
    expect(group).toHaveAttribute('tabindex', '0');
    expect(group).toHaveAccessibleDescription(/^Checks: FAIL\s+At least one check failed\s+Mergeable: UNK\s+GitHub hasn't computed it yet$/);
  });

  test('keeps both slots, empty without data, and is no keyboard stop then', () => {
    inRow(<PrChecksCell pr={{}} />);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(document.querySelector('.pr-signal-slots')?.children).toHaveLength(2);
    expect(screen.getByRole('group', { name: 'Checks and mergeability' })).not.toHaveAttribute('tabindex');
  });
});

describe('PrSizeCell', () => {
  test('shows additions and deletions, with the files in the tooltip', () => {
    inRow(<PrSizeCell pr={{ additions: '38', deletions: '12', changedFilesCount: '3' }} />);
    expect(screen.getByText('+38')).toBeInTheDocument();
    expect(screen.getByText('−12')).toBeInTheDocument();
    expect(descriptionOf(screen.getByText('+38'))).toBe('3 files changed\n+38 additions, −12 deletions');
  });

  test('shows a dash without line counts', () => {
    inRow(<PrSizeCell pr={{}} />);
    expect(screen.getByText('–')).toBeInTheDocument();
  });
});

describe('PrActivityCell', () => {
  // A PR whose author, alice, last did something at `authorAt` (bob after).
  const prWithAuthorActivity = (authorAt: string, extra = {}) => ({
    authorLogin: 'alice',
    activityEvents: [
      { sourceId: 'e1', actor: 'alice', type: 'commit', channel: 'commit', occurredAt: authorAt },
      { sourceId: 'e2', actor: 'bob', type: 'comment', channel: 'top-level', occurredAt: new Date().toISOString() },
    ],
    ...extra,
  });
  const lines = () => Array.from(document.querySelectorAll('.pr-activity-line')).map((line) => line.textContent);

  test("shows the author's last activity, with the times, any merge and the last check in the tooltip", () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60000).toISOString();
    inRow(
      <PrActivityCell pr={prWithAuthorActivity(fiveMinutesAgo, { mergedAt: fiveMinutesAgo })} lastCheckedAt={fiveMinutesAgo} sectionKey="merged" />,
    );
    expect(lines()).toEqual(['Author 5m']);
    const activity = document.querySelector('.pr-activity');
    expect(descriptionOf(activity)).toMatch(
      /^Author's last activity: .+\nYour last activity: –\nMerged: .+\nLast checked for updates at .+\.$/,
    );
    expect(activity).not.toHaveAttribute('data-stale');
  });

  test('adds your own last activity under it, when you have any', () => {
    const anHourAgo = new Date(Date.now() - 60 * 60000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60000).toISOString();
    inRow(<PrActivityCell pr={prWithAuthorActivity(anHourAgo, { baseline: twoDaysAgo })} lastCheckedAt={anHourAgo} sectionKey="merged" />);
    expect(lines()).toEqual(['Author 1h', 'You 2d']);
  });

  test('shows a dash when the author has no activity', () => {
    inRow(<PrActivityCell pr={{ authorLogin: 'alice' }} lastCheckedAt="" sectionKey="merged" />);
    expect(lines()).toEqual(['Author –']);
  });

  test('keeps the ages moving with the shared clock, without new props', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-10-24T12:00:00Z'));
      inRow(
        <NowProvider>
          <PrActivityCell pr={prWithAuthorActivity('2026-10-24T11:55:00Z')} lastCheckedAt="2026-10-24T11:59:00Z" sectionKey="open" />
        </NowProvider>,
      );
      expect(lines()).toEqual(['Author 5m']);
      expect(document.querySelector('.pr-activity')).not.toHaveAttribute('data-stale');

      act(() => {
        jest.advanceTimersByTime(20 * NOW_TICK_MS);
      });
      // 25 minutes since the author's commit, and the last check is now stale.
      expect(lines()).toEqual(['Author 25m']);
      expect(document.querySelector('.pr-activity')).toHaveAttribute('data-stale', 'true');
    } finally {
      jest.useRealTimers();
    }
  });

  test('marks an open PR whose last check is stale', () => {
    const anHourAgo = new Date(Date.now() - 60 * 60000).toISOString();
    inRow(<PrActivityCell pr={prWithAuthorActivity(anHourAgo)} lastCheckedAt={anHourAgo} sectionKey="open" />);
    const activity = document.querySelector('.pr-activity');
    expect(activity).toHaveAttribute('data-stale', 'true');
    expect(descriptionOf(activity)).toMatch(/\(stale\)$/);
  });
});
