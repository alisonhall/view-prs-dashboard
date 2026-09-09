/** @jest-environment jsdom */

const React = require('react');
const { render, screen, waitFor, fireEvent, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrJsonModal } = require('./PrJsonModal');

function installDefaultHelpers() {
  window.safeJsonStringify = (value) => JSON.stringify(value ?? null, null, 2);
  window.getPerPrUserStateFromPayload = (payload, entry, prNumber, repo) => ({
    notesByPrNumber: null,
    ackByRepo: null,
    reverifyByRepo: null,
    inReviewByRepo: null,
  });
  window.DEFAULT_REPO = 'owner/default-repo';
}

function clearHelpers() {
  ['safeJsonStringify', 'getPerPrUserStateFromPayload', 'DEFAULT_REPO'].forEach((key) => delete window[key]);
}

function mockFetchOk(diffText = 'diff --git a/foo.js b/foo.js\n@@ -1 +1 @@\n-old\n+new') {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      source: 'cache',
      stale: false,
      fetchedAt: '2026-01-01T00:00:00Z',
      filePath: 'data/pr-diffs/x.json',
      diffText,
    }),
  });
}

describe('PrJsonModal', () => {
  beforeEach(() => {
    installDefaultHelpers();
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });
  });
  afterEach(() => {
    clearHelpers();
    jest.restoreAllMocks();
    delete global.fetch;
  });

  test('given no target, when rendering, then renders nothing', () => {
    const { container } = render(<PrJsonModal target={null} payload={{}} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('given a target, when rendering, then shows the dialog with the PR number/repo subtitle and loading placeholders', async () => {
    mockFetchOk();
    const payload = { byPrNumber: {} };
    render(
      <PrJsonModal
        target={{ entry: { prNumber: '42', repo: 'owner/repo' }, pr: { number: 42 } }}
        payload={payload}
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('PR #42 (owner/repo)')).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });

  test('given a target, when the diff fetch resolves, then renders the diff grouped into a file block', async () => {
    mockFetchOk();
    const payload = { byPrNumber: {} };
    render(
      <PrJsonModal
        target={{ entry: { prNumber: '42', repo: 'owner/repo' }, pr: { number: 42 } }}
        payload={payload}
        onClose={() => {}}
      />,
    );

    await waitFor(() => expect(document.querySelector('.pr-json-diff-file-path')).toBeInTheDocument());
    expect(document.querySelector('.pr-json-diff-file-path')).toHaveTextContent('foo.js -> foo.js');
    expect(document.querySelector('.pr-json-diff-line-add')).toHaveTextContent('+new');
    expect(document.querySelector('.pr-json-diff-line-del')).toHaveTextContent('-old');
    expect(global.fetch).toHaveBeenCalledWith('/view-prs/diff?repo=owner%2Frepo&prNumber=42');
  });

  test('given the data file entry, when rendering, then strips notes and splits detail-only fields into the PR Detail section', async () => {
    mockFetchOk();
    const payload = {
      byPrNumber: {
        42: {
          prNumber: '42',
          repo: 'owner/repo',
          notes: { otherNotes: 'secret' },
          data: {
            number: 42,
            activityTimeline: [{ date: '2026-01-01' }],
            title: 'Some PR',
          },
        },
      },
    };
    render(
      <PrJsonModal
        target={{ entry: payload.byPrNumber[42], pr: { number: 42 } }}
        payload={payload}
        onClose={() => {}}
      />,
    );

    await waitFor(() => expect(document.querySelector('.pr-json-diff-file-path')).toBeInTheDocument());
    const dataBlock = document.querySelectorAll('.pr-json-block')[0];
    const prDetailBlock = document.querySelectorAll('.pr-json-block')[1];
    expect(dataBlock.textContent).not.toContain('secret');
    expect(dataBlock.textContent).not.toContain('activityTimeline');
    expect(prDetailBlock.textContent).toContain('activityTimeline');
  });

  test('given the diff fetch fails, when rendering, then shows the error text instead of a diff', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: 'boom' }),
    });
    render(
      <PrJsonModal
        target={{ entry: { prNumber: '42', repo: 'owner/repo' }, pr: { number: 42 } }}
        payload={{ byPrNumber: {} }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(document.querySelector('.pr-json-diff')).toHaveTextContent('Unable to load diff'));
    expect(document.querySelector('.pr-json-diff')).toHaveTextContent('boom');
    expect(document.querySelector('.pr-json-diff-meta')).toHaveTextContent('boom');
  });

  test('given the Wrap lines button, when clicked, then toggles the is-wrapped class and label', async () => {
    mockFetchOk();
    render(
      <PrJsonModal
        target={{ entry: { prNumber: '42', repo: 'owner/repo' }, pr: { number: 42 } }}
        payload={{ byPrNumber: {} }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(document.querySelector('.pr-json-diff-file-path')).toBeInTheDocument());

    const wrapButton = screen.getByRole('button', { name: 'Wrap lines' });
    fireEvent.click(wrapButton);
    expect(document.querySelector('.pr-json-diff')).toHaveClass('is-wrapped');
    expect(screen.getByRole('button', { name: 'Unwrap lines' })).toBeInTheDocument();
  });

  test('given the Copy diff button, when clicked, then copies the raw diff text to the clipboard', async () => {
    mockFetchOk('diff --git a/foo.js b/foo.js\n+new line');
    render(
      <PrJsonModal
        target={{ entry: { prNumber: '42', repo: 'owner/repo' }, pr: { number: 42 } }}
        payload={{ byPrNumber: {} }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(document.querySelector('.pr-json-diff-file-path')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Copy diff' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('diff --git a/foo.js b/foo.js\n+new line'));
  });

  test('given the Copy all button, when clicked, then copies AI-clipboard text including repo/PR number/diff', async () => {
    mockFetchOk('diff --git a/foo.js b/foo.js\n+new line');
    render(
      <PrJsonModal
        target={{ entry: { prNumber: '42', repo: 'owner/repo' }, pr: { number: 42 } }}
        payload={{ byPrNumber: {} }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(document.querySelector('.pr-json-diff-file-path')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Copy all PR JSON details for AI chat' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    const clipboardText = navigator.clipboard.writeText.mock.calls[0][0];
    expect(clipboardText).toContain('Repo: owner/repo');
    expect(clipboardText).toContain('PR Number: 42');
    expect(clipboardText).toContain('+new line');
  });

  test('given the close button, when clicked, then calls onClose', async () => {
    mockFetchOk();
    const onClose = jest.fn();
    render(
      <PrJsonModal
        target={{ entry: { prNumber: '42', repo: 'owner/repo' }, pr: { number: 42 } }}
        payload={{ byPrNumber: {} }}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Close PR JSON details' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('given a click on the backdrop (outside the card), when clicked, then calls onClose', async () => {
    mockFetchOk();
    const onClose = jest.fn();
    render(
      <PrJsonModal
        target={{ entry: { prNumber: '42', repo: 'owner/repo' }, pr: { number: 42 } }}
        payload={{ byPrNumber: {} }}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('given a click inside the card (not the backdrop), when clicked, then does not call onClose', async () => {
    mockFetchOk();
    const onClose = jest.fn();
    render(
      <PrJsonModal
        target={{ entry: { prNumber: '42', repo: 'owner/repo' }, pr: { number: 42 } }}
        payload={{ byPrNumber: {} }}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByText('PR JSON Details'));
    expect(onClose).not.toHaveBeenCalled();
  });

  test('given the modal is open, when Escape is pressed, then calls onClose', async () => {
    mockFetchOk();
    const onClose = jest.fn();
    render(
      <PrJsonModal
        target={{ entry: { prNumber: '42', repo: 'owner/repo' }, pr: { number: 42 } }}
        payload={{ byPrNumber: {} }}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('given the modal opens, when body overflow is locked, then it is restored on close/unmount', async () => {
    document.body.style.overflow = 'auto';
    mockFetchOk();
    const { unmount } = render(
      <PrJsonModal
        target={{ entry: { prNumber: '42', repo: 'owner/repo' }, pr: { number: 42 } }}
        payload={{ byPrNumber: {} }}
        onClose={() => {}}
      />,
    );
    expect(document.body.style.overflow).toBe('hidden');
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  test('given no repo/prNumber can be resolved, when the diff is fetched, then reports a missing-repo error without calling fetch', async () => {
    global.fetch = jest.fn();
    render(
      <PrJsonModal
        target={{ entry: {}, pr: {} }}
        payload={{ byPrNumber: {} }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(document.querySelector('.pr-json-diff-meta')).toHaveTextContent('Missing repo or PR number'));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
