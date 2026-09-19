/** @jest-environment jsdom */

const React = require('react');
const { render, screen, fireEvent, waitFor } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrTitleCell } = require('./PrTitleCell');

describe('PrTitleCell', () => {
  afterEach(() => {
    delete window.formatTitleWithIcons;
    delete window.countPendingThreadComments;
    delete window.escapeHtml;
  });

  const renderCell = (props) =>
    render(
      <table>
        <tbody>
          <tr>
            <PrTitleCell pr={{ number: '101' }} sectionKey="flagged" onToggleInsights={() => {}} {...props} />
          </tr>
        </tbody>
      </table>,
    );

  test('given a title, when rendering, then shows the formatted title text', () => {
    window.formatTitleWithIcons = (_titleDisplay, title) => `✅ ${title}`;
    renderCell({ pr: { number: '101', title: 'Fix bug' } });
    expect(document.querySelector('.title-text')).toHaveTextContent('✅ Fix bug');
  });

  test('given a smart group with a lifecycle section, when rendering, then shows the matching lifecycle badge', () => {
    renderCell({ isSmartGroup: true, lifecycleSection: 'merged' });
    expect(screen.getByText('Merged')).toHaveClass('lifecycle-badge', 'lifecycle-badge-merged');
  });

  test('given a lifecycle-section render (not a smart group), when rendering, then shows no lifecycle badge', () => {
    renderCell({ isSmartGroup: false, lifecycleSection: 'merged' });
    expect(document.querySelector('.lifecycle-badge')).not.toBeInTheDocument();
  });

  test('given a non-main target branch, when rendering, then shows the target branch note', () => {
    renderCell({ pr: { number: '101', targetBranch: 'release/2.0' } });
    expect(screen.getByText('Target branch: release/2.0')).toHaveClass('insight-subtle');
  });

  test('given a main target branch, when rendering, then omits the target branch note', () => {
    renderCell({ pr: { number: '101', targetBranch: 'main' } });
    expect(document.querySelector('.insight-subtle')).not.toBeInTheDocument();
  });

  test('given isExpanded is false, when rendering, then the toggle reads "More insights"', () => {
    renderCell({ isExpanded: false });
    const toggle = screen.getByRole('button', { name: 'More insights' });
    expect(toggle).toHaveTextContent('More insights');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('given isExpanded is true, when rendering, then the toggle reads "Hide insights"', () => {
    renderCell({ isExpanded: true });
    const toggle = screen.getByRole('button', { name: 'Hide insights' });
    expect(toggle).toHaveTextContent('Hide insights');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  test('given a toggle click, when clicked, then onToggleInsights is called with the PR number and section', () => {
    const onToggleInsights = jest.fn();
    renderCell({ pr: { number: '101' }, sectionKey: 'open', onToggleInsights });
    screen.getByRole('button', { name: 'More insights' }).click();
    expect(onToggleInsights).toHaveBeenCalledWith('101', 'open');
  });

  test('given pending comments, when rendering, then shows the pending-comments chip', () => {
    window.countPendingThreadComments = () => 3;
    renderCell({});
    expect(screen.getByText('Pending comments: 3')).toHaveClass('row-pending-comments-chip');
  });

  describe('copy title button', () => {
    let clipboardWriteMock;
    let clipboardWriteTextMock;
    let originalBlob;

    beforeEach(() => {
      clipboardWriteMock = jest.fn().mockResolvedValue(undefined);
      clipboardWriteTextMock = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { write: clipboardWriteMock, writeText: clipboardWriteTextMock },
      });
      global.ClipboardItem = function ClipboardItem(items) {
        this.items = items;
      };
      // jsdom's built-in Blob has no .text() method, so swap in a minimal
      // one for the duration of these tests to read back what was written.
      originalBlob = global.Blob;
      global.Blob = function Blob(parts) {
        this.parts = parts;
      };
      global.Blob.prototype.text = function text() {
        return Promise.resolve(this.parts.join(''));
      };
    });

    afterEach(() => {
      delete global.ClipboardItem;
      global.Blob = originalBlob;
    });

    test('given a title, when rendering, then the copy button is enabled', () => {
      renderCell({ pr: { number: '101', title: 'Fix bug' } });
      expect(screen.getByRole('button', { name: 'Copy PR title and link' })).toBeEnabled();
    });

    test('given no title, when rendering, then the copy button is disabled', () => {
      renderCell({ pr: { number: '101' } });
      expect(screen.getByRole('button', { name: 'Copy PR title and link' })).toBeDisabled();
    });

    test('given a title, repo, and PR number, when the copy button is clicked, then a rich clipboard item is written with the title, number, and a link to the PR', async () => {
      renderCell({
        pr: { number: 42, title: 'Fix bug', url: 'https://github.com/org/repo/pull/42' },
        repo: 'org/repo',
      });
      fireEvent.click(screen.getByRole('button', { name: 'Copy PR title and link' }));
      await waitFor(() => expect(clipboardWriteMock).toHaveBeenCalledTimes(1));

      const item = clipboardWriteMock.mock.calls[0][0][0];
      expect(await item.items['text/plain'].text()).toBe('Fix bug #42');
      expect(await item.items['text/html'].text()).toBe(
        'Fix bug <a href="https://github.com/org/repo/pull/42">#42</a>',
      );
      expect(await screen.findByRole('button', { name: 'Copied!' })).toHaveClass('is-copied');
    });

    test('given no pr.url, when the copy button is clicked, then the link falls back to a github.com URL built from repo and PR number', async () => {
      renderCell({ pr: { number: 7, title: 'No url pr' }, repo: 'org/repo' });
      fireEvent.click(screen.getByRole('button', { name: 'Copy PR title and link' }));
      await waitFor(() => expect(clipboardWriteMock).toHaveBeenCalledTimes(1));

      const item = clipboardWriteMock.mock.calls[0][0][0];
      expect(await item.items['text/html'].text()).toContain('https://github.com/org/repo/pull/7');
    });

    test('given a title containing HTML-sensitive characters, when copied, then the html payload is escaped', async () => {
      window.escapeHtml = (value) =>
        String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      renderCell({
        pr: { number: 9, title: 'Fix <bug> & stuff', url: 'https://github.com/org/repo/pull/9' },
        repo: 'org/repo',
      });
      fireEvent.click(screen.getByRole('button', { name: 'Copy PR title and link' }));
      await waitFor(() => expect(clipboardWriteMock).toHaveBeenCalledTimes(1));

      const item = clipboardWriteMock.mock.calls[0][0][0];
      expect(await item.items['text/plain'].text()).toBe('Fix <bug> & stuff #9');
      expect(await item.items['text/html'].text()).toBe(
        'Fix &lt;bug&gt; &amp; stuff <a href="https://github.com/org/repo/pull/9">#9</a>',
      );
    });

    test('given ClipboardItem is unsupported, when the copy button is clicked, then falls back to writeText with plain title and number', async () => {
      delete global.ClipboardItem;
      renderCell({ pr: { number: 3, title: 'Plain fallback', url: 'https://github.com/org/repo/pull/3' }, repo: 'org/repo' });
      fireEvent.click(screen.getByRole('button', { name: 'Copy PR title and link' }));
      await waitFor(() => expect(clipboardWriteTextMock).toHaveBeenCalledWith('Plain fallback #3'));

      expect(clipboardWriteMock).not.toHaveBeenCalled();
    });
  });
});
