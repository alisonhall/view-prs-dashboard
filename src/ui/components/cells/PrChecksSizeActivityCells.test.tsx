/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { NOW_TICK_MS, NowProvider } from '../../state/NowContext';
import { RepoFreshnessProvider } from '../../state/RepoFreshnessContext';
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
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();

  test("shows the author's last activity, with the times, any merge and when the details were fetched in the tooltip", () => {
    const fiveMinutesAgo = minutesAgo(5);
    const pr = prWithAuthorActivity(fiveMinutesAgo, { mergedAt: fiveMinutesAgo });
    inRow(<PrActivityCell pr={pr} entry={{ section: 'merged', fetchedAt: fiveMinutesAgo, data: pr }} />);
    expect(lines()).toEqual(['Author 5m']);
    const activity = document.querySelector('.pr-activity');
    expect(descriptionOf(activity)).toMatch(
      /^Author's last activity: .+\nYour last activity: –\nMerged: .+\nDetails fetched 5m ago \(.+\)\.$/,
    );
    // Merged rows don't go stale.
    expect(activity).not.toHaveAttribute('data-stale');
  });

  test('adds your own last activity under it, when you have any', () => {
    const anHourAgo = minutesAgo(60);
    const twoDaysAgo = minutesAgo(2 * 24 * 60);
    const pr = prWithAuthorActivity(anHourAgo, { baseline: twoDaysAgo });
    inRow(<PrActivityCell pr={pr} entry={{ section: 'merged', updatedAt: anHourAgo, data: pr }} />);
    expect(lines()).toEqual(['Author 1h', 'You 2d']);
  });

  test('shows a dash when the author has no activity', () => {
    inRow(<PrActivityCell pr={{ authorLogin: 'alice' }} entry={{ section: 'merged' }} />);
    expect(lines()).toEqual(['Author –']);
  });

  test("an open PR's summary is confirmed by its repo's latest listing, its details by their fetch", () => {
    const pr = prWithAuthorActivity(minutesAgo(60), { live: { stillOpen: true, detailsBehind: false } });
    inRow(
      <RepoFreshnessProvider liveSummary={{ 'o/r': { checkedAt: minutesAgo(2), quickCheckIntervalMs: 5 * 60000 } }}>
        <PrActivityCell pr={pr} entry={{ repo: 'o/r', section: 'open', fetchedAt: minutesAgo(180), data: pr }} />
      </RepoFreshnessProvider>,
    );
    const activity = document.querySelector('.pr-activity');
    expect(descriptionOf(activity)).toMatch(/\nSummary confirmed 2m ago \(.+\)\.\nDetails fetched 3h ago \(.+\)\.$/);
    expect(activity).not.toHaveAttribute('data-stale');
    expect(activity).not.toHaveAttribute('data-details-behind');
  });

  test("marks an open PR stale while its repo's listing fails", () => {
    const pr = prWithAuthorActivity(minutesAgo(60), { live: { stillOpen: true } });
    inRow(
      <RepoFreshnessProvider
        liveSummary={{ 'o/r': { checkedAt: minutesAgo(2), lastError: 'rate limited', lastErrorAt: minutesAgo(1) } }}
      >
        <PrActivityCell pr={pr} entry={{ repo: 'o/r', section: 'open', fetchedAt: minutesAgo(3), data: pr }} />
      </RepoFreshnessProvider>,
    );
    const activity = document.querySelector('.pr-activity');
    expect(activity).toHaveAttribute('data-stale', 'true');
    expect(descriptionOf(activity)).toMatch(/\nStale: checking its repo is failing \(rate limited\)\.$/);
  });

  test("dims the ages while the PR's details are behind GitHub", () => {
    const pr = prWithAuthorActivity(minutesAgo(60), { live: { stillOpen: true, detailsBehind: true } });
    inRow(<PrActivityCell pr={pr} entry={{ repo: 'o/r', section: 'open', fetchedAt: minutesAgo(1), data: pr }} />);
    const activity = document.querySelector('.pr-activity');
    expect(activity).toHaveAttribute('data-details-behind', 'true');
    expect(descriptionOf(activity)).toMatch(/GitHub has newer activity/);
  });

  test('keeps the ages moving with the shared clock, without new props', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-10-24T12:00:00Z'));
      const pr = prWithAuthorActivity('2026-10-24T11:55:00Z');
      inRow(
        <NowProvider>
          <PrActivityCell pr={pr} entry={{ section: 'open', fetchedAt: '2026-10-24T11:59:00Z', data: pr }} />
        </NowProvider>,
      );
      expect(lines()).toEqual(['Author 5m']);
      expect(document.querySelector('.pr-activity')).not.toHaveAttribute('data-stale');

      act(() => {
        jest.advanceTimersByTime(20 * NOW_TICK_MS);
      });
      // 25 minutes since the author's commit, and 21 since the row was last
      // confirmed: more than two 5-minute quick checks, so stale.
      expect(lines()).toEqual(['Author 25m']);
      expect(document.querySelector('.pr-activity')).toHaveAttribute('data-stale', 'true');
    } finally {
      jest.useRealTimers();
    }
  });

  test('marks an open PR that has not been confirmed recently', () => {
    const anHourAgo = minutesAgo(60);
    const pr = prWithAuthorActivity(anHourAgo);
    inRow(<PrActivityCell pr={pr} entry={{ section: 'open', updatedAt: anHourAgo, data: pr }} />);
    const activity = document.querySelector('.pr-activity');
    expect(activity).toHaveAttribute('data-stale', 'true');
    expect(descriptionOf(activity)).toMatch(/\nStale: not confirmed recently\.$/);
  });
});
