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
  test('shows the age, with the activity, your last activity and the last check in the tooltip', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60000).toISOString();
    inRow(<PrActivityCell pr={{ mergedAt: fiveMinutesAgo }} lastCheckedAt={fiveMinutesAgo} sectionKey="merged" />);
    const age = screen.getByText('5m');
    expect(descriptionOf(age)).toMatch(/^Merged: .+\nYour last activity: –\nLast checked for updates at .+\.$/);
    expect(age).not.toHaveAttribute('data-stale');
  });

  test('keeps the age moving with the shared clock, without new props', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-10-24T12:00:00Z'));
      inRow(
        <NowProvider>
          <PrActivityCell pr={{ sourceUpdatedAt: '2026-10-24T11:55:00Z' }} lastCheckedAt="2026-10-24T11:59:00Z" sectionKey="open" />
        </NowProvider>,
      );
      expect(screen.getByText('5m')).not.toHaveAttribute('data-stale');

      act(() => {
        jest.advanceTimersByTime(20 * NOW_TICK_MS);
      });
      // 25 minutes since the commit, and the last check is now stale.
      expect(screen.getByText('25m')).toHaveAttribute('data-stale', 'true');
    } finally {
      jest.useRealTimers();
    }
  });

  test('marks an open PR whose last check is stale', () => {
    const anHourAgo = new Date(Date.now() - 60 * 60000).toISOString();
    inRow(<PrActivityCell pr={{ sourceUpdatedAt: anHourAgo }} lastCheckedAt={anHourAgo} sectionKey="open" />);
    const age = screen.getByText('1h');
    expect(age).toHaveAttribute('data-stale', 'true');
    expect(descriptionOf(age)).toMatch(/\(stale\)$/);
  });
});
