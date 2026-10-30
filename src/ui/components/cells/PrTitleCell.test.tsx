/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrTitleCell, type PrTitleCellProps } from './PrTitleCell';

const renderCell = (props: Partial<PrTitleCellProps> = {}) => {
  const onToggleInsights = props.onToggleInsights ?? jest.fn();
  render(
    <table>
      <tbody>
        <tr>
          <PrTitleCell
            pr={{ number: '101', title: 'Fix bug' }}
            repo="owner/repo"
            sectionKey="open"
            isExpanded={false}
            {...props}
            onToggleInsights={onToggleInsights}
          />
        </tr>
      </tbody>
    </table>,
  );
  return { onToggleInsights };
};

describe('PrTitleCell', () => {
  test('shows the title without its [CHK]/[MRG] markers, followed by the #number link', () => {
    renderCell({ pr: { number: '101', title: 'Fix bug', titleDisplay: 'Fix bug [CHK:PASS][MRG:YES]', url: 'https://github.com/o/r/pull/101' } });

    expect(screen.getByText(/Fix bug/)).not.toHaveTextContent('CHK');
    const link = screen.getByRole('link', { name: '#101' });
    expect(link).toHaveAttribute('href', 'https://github.com/o/r/pull/101');
    expect(link).toHaveClass('pr-link');
  });

  test('builds the link from the repo when the PR has no url', () => {
    renderCell({ pr: { number: '7', title: 'No url' }, repo: 'org/repo' });
    expect(screen.getByRole('link', { name: '#7' })).toHaveAttribute('href', 'https://github.com/org/repo/pull/7');
  });

  test('carries data-pr-number and data-repo, which "Jump to PR" looks for', () => {
    renderCell();
    const cell = screen.getByRole('cell');
    expect(cell).toHaveAttribute('data-pr-number', '101');
    expect(cell).toHaveAttribute('data-repo', 'owner/repo');
  });

  test('shows the PR state in smart groups only', () => {
    renderCell({ isSmartGroup: true, lifecycleSection: 'draft' });
    expect(screen.getByRole('img', { name: 'Draft' })).toBeInTheDocument();
  });

  test('shows no PR state in a lifecycle section', () => {
    renderCell({ isSmartGroup: false, lifecycleSection: 'draft' });
    expect(screen.queryByRole('img', { name: 'Draft' })).not.toBeInTheDocument();
  });

  test('shows a label chip per label, the same colour each time for the same name', () => {
    renderCell({ pr: { number: '101', title: 'Fix', labels: ['bug', { name: 'docs' }] } });
    expect(screen.getByText('bug')).toHaveClass('pr-label');
    expect(screen.getByText('docs')).toHaveClass('pr-label');
    const hue = screen.getByText('bug').getAttribute('data-hue');
    expect(hue).toMatch(/^[0-4]$/);
  });

  // The same layout however wide the column: the chevron beside the title,
  // and the labels always on a line of their own under it.
  test('puts the PR number first, on a line of its own above the title, so it is in the same place on every row', () => {
    renderCell({ pr: { number: '101', title: 'A long title that wraps onto more lines' } });
    const numberLine = document.querySelector('.pr-title-number-line');
    const link = screen.getByRole('link', { name: '#101' });
    expect(numberLine?.firstElementChild).toBe(link);
    expect(numberLine?.nextElementSibling).toBe(document.querySelector('.pr-title-line'));
    expect(document.querySelector('.pr-title-line')).not.toContainElement(link);
  });

  test('puts the labels after the PR number on the first line, and the title under them (two lines, not three)', () => {
    renderCell({ pr: { number: '101', title: 'Fix', labels: ['bug'] } });
    const numberLine = document.querySelector('.pr-title-number-line');
    const titleLine = document.querySelector('.pr-title-line');
    expect(numberLine?.firstElementChild).toBe(screen.getByRole('link', { name: '#101' }));
    expect(numberLine).toContainElement(screen.getByText('bug'));
    expect(titleLine).toHaveTextContent('Fix');
    expect(titleLine).not.toContainElement(screen.getByText('bug'));
    expect(numberLine?.nextElementSibling).toBe(titleLine);
    expect(document.querySelector('.pr-title-cell')?.firstElementChild).toBe(
      screen.getByRole('button', { name: 'Show summary for PR #101' }),
    );
  });

  test('has no labels without labels', () => {
    renderCell({ pr: { number: '101', title: 'Fix' } });
    expect(document.querySelector('.pr-title-labels')).toBeNull();
  });

  test('notes a non-main target branch, and not main', () => {
    renderCell({ pr: { number: '101', title: 'Fix', targetBranch: 'release/2.0' } });
    expect(screen.getByText(/Target branch:/)).toHaveTextContent('Target branch: release/2.0');
  });

  test('says nothing about a main target branch', () => {
    renderCell({ pr: { number: '101', title: 'Fix', targetBranch: 'main' } });
    expect(screen.queryByText(/Target branch:/)).not.toBeInTheDocument();
  });

  test('the toggle is named by state and PR number, and reports the PR, section and repo', async () => {
    const user = userEvent.setup();
    const { onToggleInsights } = renderCell({ sectionKey: 'needs-attention' });

    const toggle = screen.getByRole('button', { name: 'Show summary for PR #101' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(onToggleInsights).toHaveBeenCalledWith('101', 'needs-attention', 'owner/repo');
  });

  test('an expanded row names its toggle "Hide summary"', () => {
    renderCell({ isExpanded: true });
    expect(screen.getByRole('button', { name: 'Hide summary for PR #101' })).toHaveAttribute('aria-expanded', 'true');
  });

  test('shows unsubmitted pending comments, and nothing without them', () => {
    renderCell({
      pr: {
        number: '101',
        title: 'Fix',
        reviewThreads: [{ comments: [{ state: 'PENDING' }, { state: 'PENDING' }] }],
      },
    });
    expect(screen.getByText('2 pending comments')).toBeInTheDocument();
  });

  test('shows "Update queued" when the server flagged a pending update', () => {
    renderCell({ pr: { number: '101', title: 'Fix', updatePending: true } });
    expect(screen.getByText('Update queued')).toBeInTheDocument();
  });

  test('shows nothing extra for a plain PR', () => {
    renderCell();
    expect(screen.queryByText(/pending comment/)).not.toBeInTheDocument();
    expect(screen.queryByText('Update queued')).not.toBeInTheDocument();
  });

  test('shows the PR refreshing, and active wins over queued', () => {
    renderCell({ isActive: true, isQueued: true });
    expect(screen.getByRole('img', { name: 'PR #101 update in progress' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'PR #101 queued for update' })).not.toBeInTheDocument();
  });

  test('shows the PR queued for refresh', () => {
    renderCell({ isQueued: true });
    expect(screen.getByRole('img', { name: 'PR #101 queued for update' })).toBeInTheDocument();
  });

  describe('copy title button', () => {
    let clipboardWriteMock: jest.Mock;
    let clipboardWriteTextMock: jest.Mock;
    const originalBlob = global.Blob;

    beforeEach(() => {
      clipboardWriteMock = jest.fn().mockResolvedValue(undefined);
      clipboardWriteTextMock = jest.fn().mockResolvedValue(undefined);
      // defineProperty: userEvent.setup() (earlier tests) leaves a
      // getter-only navigator.clipboard behind.
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: clipboardWriteMock, writeText: clipboardWriteTextMock },
        configurable: true,
      });
      (global as unknown as { ClipboardItem: unknown }).ClipboardItem = function ClipboardItem(this: { items: unknown }, items: unknown) {
        this.items = items;
      };
      // jsdom's Blob has no .text(); a minimal one reads back what was written.
      const FakeBlob = function Blob(this: { parts: string[] }, parts: string[]) {
        this.parts = parts;
      } as unknown as typeof Blob;
      (FakeBlob.prototype as unknown as { text: () => Promise<string> }).text = function text(this: { parts: string[] }) {
        return Promise.resolve(this.parts.join(''));
      };
      global.Blob = FakeBlob;
    });

    afterEach(() => {
      delete (global as unknown as { ClipboardItem?: unknown }).ClipboardItem;
      global.Blob = originalBlob;
    });

    const writtenItem = () => clipboardWriteMock.mock.calls[0][0][0].items as Record<string, { text: () => Promise<string> }>;

    test('is disabled without a title', () => {
      renderCell({ pr: { number: '101' } });
      expect(screen.getByRole('button', { name: 'Copy PR title and link' })).toBeDisabled();
    });

    test('writes the title and number, with a link in the rich version', async () => {
      renderCell({ pr: { number: 42, title: 'Fix bug', url: 'https://github.com/org/repo/pull/42' }, repo: 'org/repo' });
      fireEvent.click(screen.getByRole('button', { name: 'Copy PR title and link' }));
      await waitFor(() => expect(clipboardWriteMock).toHaveBeenCalledTimes(1));

      expect(await writtenItem()['text/plain']?.text()).toBe('Fix bug #42');
      expect(await writtenItem()['text/html']?.text()).toBe('Fix bug <a href="https://github.com/org/repo/pull/42">#42</a>');
      expect(await screen.findByRole('button', { name: 'Copied!' })).toHaveClass('is-copied');
    });

    test('escapes HTML in the rich version', async () => {
      renderCell({ pr: { number: 9, title: 'Fix <bug> & stuff', url: 'https://github.com/org/repo/pull/9' }, repo: 'org/repo' });
      fireEvent.click(screen.getByRole('button', { name: 'Copy PR title and link' }));
      await waitFor(() => expect(clipboardWriteMock).toHaveBeenCalledTimes(1));

      expect(await writtenItem()['text/html']?.text()).toBe('Fix &lt;bug&gt; &amp; stuff <a href="https://github.com/org/repo/pull/9">#9</a>');
    });

    test('falls back to plain text without ClipboardItem', async () => {
      delete (global as unknown as { ClipboardItem?: unknown }).ClipboardItem;
      renderCell({ pr: { number: 3, title: 'Plain fallback', url: 'https://github.com/org/repo/pull/3' }, repo: 'org/repo' });
      fireEvent.click(screen.getByRole('button', { name: 'Copy PR title and link' }));
      await waitFor(() => expect(clipboardWriteTextMock).toHaveBeenCalledWith('Plain fallback #3'));
      expect(clipboardWriteMock).not.toHaveBeenCalled();
    });
  });
});
