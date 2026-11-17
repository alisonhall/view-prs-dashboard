/** @jest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import { PrInsightsDisplayContext, defaultPrInsightsDisplay, type PrInsightsDisplayValue } from '../../state/PrInsightsDisplayContext';
import type { PrData, PrEntry } from '../../types/pr-data.ts';
import { PrOverview } from './PrOverview';

const renderOverview = (
  pr: PrData,
  {
    entry = {},
    display = {},
    lastLookedAt,
    lastAckedAt,
  }: { entry?: PrEntry; display?: Partial<PrInsightsDisplayValue>; lastLookedAt?: string; lastAckedAt?: string } = {},
) =>
  render(
    <PrInsightsDisplayContext.Provider value={{ ...defaultPrInsightsDisplay, ...display }}>
      <PrOverview entry={entry} pr={pr} actorsMap={{ sam: 'Sam Lee' }} lastLookedAt={lastLookedAt} lastAckedAt={lastAckedAt} />
    </PrInsightsDisplayContext.Provider>,
  );

// The values of a group's rows, by label.
const groupRows = (name: string) => {
  const group = screen.getByRole('group', { name });
  const keys = Array.from(group.querySelectorAll('.insight-key')).map((key) => key.textContent);
  const values = Array.from(group.querySelectorAll('.insight-value')).map((value) => value.textContent);
  return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
};

describe('PrOverview', () => {
  test('groups the rows as Review, People and Changes', () => {
    renderOverview({
      number: '1',
      status: 'changed',
      checkState: 'PASS',
      mergeState: 'YES',
      sourceBranch: 'feature/x',
      targetBranch: 'main',
      additions: '3',
      deletions: '1',
      changedFilesCount: '2',
    });

    expect(groupRows('Review')).toMatchObject({ Status: 'CHANGED', 'CHK state': 'PASS', Mergeability: 'YES' });
    expect(Object.keys(groupRows('People'))).toEqual(['Approvers', 'Reviewers', 'Assigned']);
    expect(groupRows('Changes')).toMatchObject({
      'Source branch': 'feature/x',
      'Target branch': 'main',
      'Lines changed': '2 files changed, +3 additions, -1 deletions (4 lines changed)',
    });
  });

  test('says when you last looked, and whether that was your Ack or your last activity', () => {
    const { unmount } = renderOverview({ number: '1' }, { lastLookedAt: '2026-01-02T03:04:05Z', lastAckedAt: '2026-01-02T03:04:05Z' });
    expect(groupRows('Review')['You last looked']).toMatch(/\(your Ack\)$/);
    unmount();

    const second = renderOverview({ number: '1' }, { lastLookedAt: '2026-01-02T03:04:05Z', lastAckedAt: '2026-01-01T00:00:00Z' });
    expect(groupRows('Review')['You last looked']).toMatch(/\(your last activity\)$/);
    second.unmount();

    renderOverview({ number: '1' });
    expect(groupRows('Review')).not.toHaveProperty('You last looked');
  });

  test("names who's requesting changes now, only when anyone is", () => {
    const { unmount } = renderOverview({
      number: '1',
      reviews: [
        { authorLogin: 'sam', state: 'CHANGES_REQUESTED', submittedAt: '2026-01-02T00:00:00Z' },
        { authorLogin: 'ann', state: 'CHANGES_REQUESTED', submittedAt: '2026-01-01T00:00:00Z' },
        { authorLogin: 'ann', state: 'APPROVED', submittedAt: '2026-01-03T00:00:00Z' },
      ],
    });
    expect(groupRows('Review')['Changes requested by']).toBe('Sam Lee');
    unmount();

    renderOverview({ number: '1', reviews: [{ authorLogin: 'ann', state: 'APPROVED', submittedAt: '2026-01-03T00:00:00Z' }] });
    expect(groupRows('Review')).not.toHaveProperty('Changes requested by');
  });

  test('reads CHK and MRG from the title markers when the fields are missing', () => {
    renderOverview({ number: '1', titleDisplay: 'Fix [CHK:FAIL][MRG:NO]' });
    expect(groupRows('Review')).toMatchObject({ 'CHK state': 'FAIL', Mergeability: 'NO' });
  });

  test('keeps Data freshness in a collapsed group, with when the details were fetched from the entry', () => {
    renderOverview({ number: '1', sourceUpdatedAt: '2026-01-02T03:04:05Z' }, { entry: { section: 'merged', updatedAt: '2026-01-03T00:00:00Z' } });
    const freshness = screen.getByText('Data freshness').closest('details') as HTMLDetailsElement;
    expect(freshness.open).toBe(false);
    expect(within(freshness).getByText('Details fetched')).toBeInTheDocument();
    // Only an open PR's summary is confirmed by its repo's checks.
    expect(within(freshness).queryByText('Summary confirmed')).not.toBeInTheDocument();
    expect(within(freshness).getByText('Latest data timestamp')).toHaveAttribute('title', expect.stringContaining('source PR data'));
  });

  test("an open PR's Data freshness has when its summary was confirmed, marked stale when it's old", () => {
    renderOverview(
      { number: '1', live: { stillOpen: true, detailsBehind: true } },
      { entry: { section: 'open', fetchedAt: '2026-01-03T00:00:00Z' } },
    );
    const freshness = screen.getByText('Data freshness').closest('details') as HTMLDetailsElement;
    // Each key and value is a grid item of its own.
    const rowValue = (label: string) => within(freshness).getByText(label).nextElementSibling?.textContent ?? '';
    expect(rowValue('Summary confirmed')).toMatch(/\(stale\)$/);
    expect(rowValue('Details fetched')).toMatch(/\(GitHub has newer activity\)$/);
  });

  test('shows Approval risk details only when there are approvals', () => {
    const { unmount } = renderOverview({ number: '1' });
    expect(screen.queryByText('Approval risk details')).not.toBeInTheDocument();
    unmount();

    renderOverview({ number: '1', metrics: { approvals: [{ login: 'bob', approvedAt: '2026-01-01T00:00:00Z', riskyApproval: true }] } });
    expect(screen.getByText('Approval risk details')).toBeInTheDocument();
    expect(screen.getByText(/risk flagged/)).toBeInTheDocument();
  });

  test('given viewer-specific open conversations, when rendering, then the label says so', () => {
    renderOverview({ number: '1' }, { display: { getOpenConversationCountWithMe: () => ({ count: 2, isViewerSpecific: true, waitingCount: 0 }) } });
    expect(groupRows('Review')['Open conversations with me']).toBe('2');
  });

});
