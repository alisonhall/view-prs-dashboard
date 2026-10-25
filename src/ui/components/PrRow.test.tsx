/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { render as baseRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequestActivityContext } from '../state/RequestActivityContext';
import { PrRow, type PrRowProps } from './PrRow';

// The details row renders NotesSection for real, which reads
// beginRequestActivity from this context.
const render = (ui: ReactNode) =>
  baseRender(
    <RequestActivityContext.Provider value={{ beginRequestActivity: () => () => {} } as never}>{ui}</RequestActivityContext.Provider>,
  );

const basePr = { number: '101', title: 'Fix bug', labels: [] };

const renderRow = (props: Partial<PrRowProps> = {}) =>
  render(
    <table>
      <tbody>
        <PrRow
          entry={{ prNumber: '101', repo: 'owner/repo', section: 'open', data: basePr }}
          pr={basePr}
          repo="owner/repo"
          sectionKey="open"
          lifecycleSection="open"
          isExpanded={false}
          isDetailsOpen={false}
          isFlagged={false}
          isInReview={false}
          isAcknowledged={false}
          attentionReasons=""
          isActive={false}
          isQueued={false}
          columnCount={9}
          showSizeAndActivity
          onToggleInsights={jest.fn()}
          {...props}
        />
      </tbody>
    </table>,
  );

const cellClasses = () =>
  Array.from(document.querySelector('tr.pr-row')?.children || []).map((cell) =>
    Array.from(cell.classList).find((name) => name.startsWith('pr-cell-')),
  );

describe('PrRow', () => {
  test('renders the columns in order', () => {
    renderRow();
    expect(cellClasses()).toEqual([
      'pr-cell-select',
      'pr-cell-signals',
      'pr-cell-title',
      'pr-cell-who',
      'pr-cell-review',
      'pr-cell-checks',
      'pr-cell-size',
      'pr-cell-activity',
      'pr-cell-actions',
    ]);
  });

  test('leaves out Size and Activity when asked (the detail pane is open)', () => {
    renderRow({ showSizeAndActivity: false, columnCount: 7 });
    expect(cellClasses()).not.toContain('pr-cell-size');
    expect(cellClasses()).not.toContain('pr-cell-activity');
  });

  test('tags the row with its PR number and section', () => {
    renderRow({ sectionKey: 'needs-attention' });
    const row = document.querySelector('tr.pr-row');
    expect(row).toHaveAttribute('data-pr-number', '101');
    expect(row).toHaveAttribute('data-section-key', 'needs-attention');
  });

  test('a collapsed row\'s summary and details rows are hidden and span every column', () => {
    renderRow({ columnCount: 9 });
    // Testing Library doesn't name hidden elements, so find them by label.
    for (const label of ['Summary for PR #101', 'Insights for PR #101']) {
      const row = document.querySelector(`tr[aria-label="${label}"]`) as HTMLElement;
      expect(row).not.toBeVisible();
      expect(row.querySelector('td')).toHaveAttribute('colspan', '9');
    }
  });

  test('an expanded row shows its summary, with the details still closed', () => {
    renderRow({ isExpanded: true });
    expect(screen.getByRole('row', { name: 'Summary for PR #101' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Latest activity' })).toBeInTheDocument();
    expect(document.querySelector('tr[aria-label="Insights for PR #101"]')).not.toBeVisible();
    expect(document.querySelector('tr.pr-row')).toHaveAttribute('data-expanded', 'true');
  });

  test('an expanded row with its details open shows the full insights, which the Details button controls', () => {
    renderRow({ isExpanded: true, isDetailsOpen: true });
    const insightsRow = screen.getByRole('row', { name: 'Insights for PR #101' });
    expect(insightsRow).toBeVisible();
    expect(insightsRow.textContent).not.toBe('');
    const detailsButton = screen.getByRole('button', { name: 'Hide details for PR #101' });
    expect(detailsButton).toHaveAttribute('aria-expanded', 'true');
    expect(detailsButton).toHaveAttribute('aria-controls', insightsRow.id);
  });

  test('details open without the summary (row collapsed) stay hidden', () => {
    renderRow({ isExpanded: false, isDetailsOpen: true });
    expect(document.querySelector('tr[aria-label="Insights for PR #101"]')).not.toBeVisible();
  });

  test('the Details button reports the PR, section and repo', async () => {
    const user = userEvent.setup();
    const onToggleDetails = jest.fn();
    renderRow({ isExpanded: true, sectionKey: 'needs-attention', onToggleDetails });
    await user.click(screen.getByRole('button', { name: 'Show details for PR #101' }));
    expect(onToggleDetails).toHaveBeenCalledWith('101', 'needs-attention', 'owner/repo');
  });

  test('passes the attention reasons to the Signals cell', () => {
    renderRow({ attentionReasons: 'New commits\nNew comments' });
    expect(screen.getByRole('group', { name: 'Signals' })).toHaveAccessibleDescription(/Needs attention\s+New commits\s+New comments/);
  });

  test('keeps keyboard stops to one per cell: no per-icon stops', () => {
    // A busy-looking row: changed, needs attention, flagged, in review,
    // approvals, conversations, viewed files, notes, an assignee, checks.
    const pr = {
      ...basePr,
      status: 'CHANGED',
      approved: 'YES',
      approvalCount: '2',
      viewedFilesCount: '1',
      changedFilesCount: '3',
      additions: '10',
      deletions: '2',
      checkState: 'PASS',
      mergeState: 'YES',
      assignees: [{ login: 'hubot', name: 'Hubot' }],
      authorLogin: 'octocat',
      author: 'The Octocat',
    };
    renderRow({
      pr,
      entry: { prNumber: '101', repo: 'owner/repo', section: 'open', data: pr, notes: { otherNotes: 'x' } },
      attentionReasons: 'New commits',
      isFlagged: true,
      isInReview: true,
    });
    const row = document.querySelector('tr.pr-row') as HTMLElement;
    const stops = Array.from(row.querySelectorAll('a[href], button, input, [tabindex]')).filter(
      (element) => element.getAttribute('tabindex') !== '-1',
    );
    // select, Signals, toggle, link, copy, Who, Review, CHK·MRG, Size,
    // Activity, and 5 actions.
    expect(stops).toHaveLength(15);
  });

  test('threads onViewJson down to the More menu', async () => {
    const user = userEvent.setup();
    const onViewJson = jest.fn();
    renderRow({ onViewJson });
    await user.click(screen.getByRole('button', { name: 'More actions for PR #101' }));
    await user.click(screen.getByRole('menuitem', { name: 'View PR JSON details' }));
    expect(onViewJson).toHaveBeenCalledWith({ prNumber: '101', repo: 'owner/repo' }, basePr);
  });
});
