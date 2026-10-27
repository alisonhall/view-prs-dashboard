/** @jest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import { PrInsightsDisplayContext, defaultPrInsightsDisplay, type PrInsightsDisplayValue } from '../../state/PrInsightsDisplayContext';
import type { PrData, PrEntry } from '../../types/pr-data.ts';
import { PrOverview } from './PrOverview';

const renderOverview = (pr: PrData, { entry = {}, display = {} }: { entry?: PrEntry; display?: Partial<PrInsightsDisplayValue> } = {}) =>
  render(
    <PrInsightsDisplayContext.Provider value={{ ...defaultPrInsightsDisplay, ...display }}>
      <PrOverview entry={entry} pr={pr} actorsMap={{}} />
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
      'Merged to': 'main',
      'Lines changed': '2 files changed, +3 additions, -1 deletions (4 lines changed)',
    });
  });

  test('reads CHK and MRG from the title markers when the fields are missing', () => {
    renderOverview({ number: '1', titleDisplay: 'Fix [CHK:FAIL][MRG:NO]' });
    expect(groupRows('Review')).toMatchObject({ 'CHK state': 'FAIL', Mergeability: 'NO' });
  });

  test('keeps Data freshness in a collapsed group, with the check time from the entry', () => {
    renderOverview({ number: '1', sourceUpdatedAt: '2026-01-02T03:04:05Z' }, { entry: { updatedAt: '2026-01-03T00:00:00Z' } });
    const freshness = screen.getByText('Data freshness').closest('details') as HTMLDetailsElement;
    expect(freshness.open).toBe(false);
    expect(within(freshness).getByText('Last checked for updates')).toBeInTheDocument();
    expect(within(freshness).getByText('Latest data timestamp')).toHaveAttribute('title', expect.stringContaining('source PR data'));
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
    renderOverview({ number: '1' }, { display: { getOpenConversationCountWithMe: () => ({ count: 2, isViewerSpecific: true }) } });
    expect(groupRows('Review')['Open conversations with me']).toBe('2');
  });

});
