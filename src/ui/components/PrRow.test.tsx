/** @jest-environment jsdom */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrRow, type PrRowProps } from './PrRow';

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
          isFlagged={false}
          isInReview={false}
          isAcknowledged={false}
          attentionReasons=""
          isActive={false}
          isQueued={false}
          columnCount={9}
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

  test('tags the row with its PR number and section', () => {
    renderRow({ sectionKey: 'needs-attention' });
    const row = document.querySelector('tr.pr-row');
    expect(row).toHaveAttribute('data-pr-number', '101');
    expect(row).toHaveAttribute('data-section-key', 'needs-attention');
  });

  test('a collapsed row\'s summary row is hidden and spans every column', () => {
    renderRow({ columnCount: 9 });
    // Testing Library doesn't name hidden elements, so find it by label.
    const summaryRow = document.querySelector('tr[aria-label="Summary for PR #101"]') as HTMLElement;
    expect(summaryRow).not.toBeVisible();
    expect(summaryRow.querySelector('td')).toHaveAttribute('colspan', '9');
  });

  test('an expanded row shows its summary', () => {
    renderRow({ isExpanded: true });
    expect(screen.getByRole('row', { name: 'Summary for PR #101' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Latest activity' })).toBeInTheDocument();
    expect(document.querySelector('tr.pr-row')).toHaveAttribute('data-expanded', 'true');
  });

  test('the summary\'s "Show details" reports the PR and repo', async () => {
    const user = userEvent.setup();
    const onShowDetails = jest.fn();
    renderRow({ isExpanded: true, onShowDetails });
    await user.click(screen.getByRole('button', { name: 'Show details for PR #101' }));
    expect(onShowDetails).toHaveBeenCalledWith('101', 'owner/repo');
  });

  test('a click on the row, not on a control, selects it', async () => {
    const user = userEvent.setup();
    const onSelectRow = jest.fn();
    renderRow({ onSelectRow });
    await user.click(screen.getByRole('group', { name: 'Signals' }).closest('td') as HTMLElement);
    expect(onSelectRow).toHaveBeenCalledWith('101', 'owner/repo');
  });

  test('a click on a signal icon (inside a focusable group, not a control) selects it too', async () => {
    const user = userEvent.setup();
    const onSelectRow = jest.fn();
    const pr = { ...basePr, approved: 'YES', approvalCount: '1' };
    renderRow({ pr, entry: { prNumber: '101', repo: 'owner/repo', section: 'open', data: pr }, onSelectRow });
    const reviewGroup = screen.getByRole('group', { name: 'Review' });
    expect(reviewGroup).toHaveAttribute('tabindex', '0');
    await user.click(within(reviewGroup).getAllByRole('img')[0] as HTMLElement);
    expect(onSelectRow).toHaveBeenCalledWith('101', 'owner/repo');
  });

  test('clicks on the row\'s controls and links do not select it', async () => {
    const user = userEvent.setup();
    const onSelectRow = jest.fn();
    renderRow({ onSelectRow });
    await user.click(screen.getByRole('button', { name: 'Show summary for PR #101' }));
    await user.click(screen.getByRole('button', { name: 'Update PR #101' }));
    await user.click(screen.getByRole('checkbox'));
    expect(onSelectRow).not.toHaveBeenCalled();
  });

  test('a selected row is marked as the current one, and tagged with its repo', () => {
    renderRow({ isSelected: true });
    const row = document.querySelector('tr.pr-row');
    expect(row).toHaveAttribute('aria-current', 'true');
    expect(row).toHaveAttribute('data-repo', 'owner/repo');
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
