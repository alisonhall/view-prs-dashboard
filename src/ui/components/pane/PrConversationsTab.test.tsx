/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthorThreadResolutionSelectionContext } from '../../state/AuthorThreadResolutionSelectionContext';
import { ReviewConversationsUiStateProvider } from '../ReviewConversationsUiStateProvider';
import type { PrData, ReviewThread } from '../../types/pr-data.ts';
import { PrConversationsTab } from './PrConversationsTab';

// index.html loads marked and DOMPurify from <script>s; without them the
// markdown renderer fails closed to escaped text.
beforeAll(() => {
  const globals = window as unknown as { DOMPurify: unknown; marked: unknown };
  globals.DOMPurify = jest.requireActual('dompurify');
  globals.marked = jest.requireActual('../../vendor/marked.umd.js');
});

const comment = (authorLogin: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  id: `${authorLogin}-${createdAt}`,
  authorLogin,
  createdAt,
  body: `${authorLogin}: a comment`,
  ...extra,
});
const thread = (id: string, comments: object[], extra: Partial<ReviewThread> = {}): ReviewThread => ({ id, isResolved: false, comments, ...extra });

// "me" is the viewer; "author" wrote the PR.
const basePr = (reviewThreads: ReviewThread[], extra: Partial<PrData> = {}): PrData => ({
  number: '7',
  url: 'https://github.com/o/r/pull/7',
  authorLogin: 'author',
  viewerLogin: 'me',
  reviewThreads,
  ...extra,
});

const threads = [
  thread('waiting', [comment('me', '2026-01-01T00:00:00Z', { path: 'src/a.ts', line: 9, body: 'Why this?' }), comment('author', '2026-01-02T00:00:00Z', { body: 'Because.' })]),
  thread('open', [comment('bob', '2026-01-01T00:00:00Z', { path: 'src/a.ts', line: 3, body: 'Rename it', url: 'https://github.com/o/r/pull/7#d1' })]),
  thread('resolved', [comment('bob', '2026-01-01T00:00:00Z', { path: 'src/b.ts', line: 1, body: 'Typo' })], { isResolved: true, resolvedByLogin: 'bob' }),
];

const rows = () => Array.from(document.querySelectorAll('.pr-conv-thread')).map((row) => row.getAttribute('data-thread-id'));
const chip = (name: string) => within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: new RegExp(`^${name}`) });

describe('PrConversationsTab', () => {
  test('summarises unresolved and waiting-on-you threads', () => {
    render(<PrConversationsTab pr={basePr(threads)} />);
    expect(document.querySelector('.pr-conv-summary')).toHaveTextContent('2 unresolved');
    expect(document.querySelector('.pr-conv-summary')).toHaveTextContent('1 waiting on you');
    expect(document.querySelector('.pr-conv-summary')).not.toHaveTextContent('wrong person');
  });

  test('defaults to Unresolved: groups its threads by file, by line, and says how many resolved are hidden', () => {
    render(<PrConversationsTab pr={basePr(threads)} />);
    expect(chip('Unresolved')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Unresolved')).toHaveTextContent('2');
    const files = screen.getAllByRole('button', { name: /src\// });
    expect(files.map((file) => file.textContent)).toEqual(['src/a.ts· 2']);
    expect(rows()).toEqual(['open', 'waiting']);
    expect(screen.getByText(/1 resolved conversation hidden/)).toBeInTheDocument();
  });

  test('"Show all" and the All chip show every thread; Waiting on me only those waiting', async () => {
    const user = userEvent.setup();
    render(<PrConversationsTab pr={basePr(threads)} />);
    await user.click(screen.getByRole('button', { name: 'Show all' }));
    expect(chip('All')).toHaveAttribute('aria-pressed', 'true');
    expect(rows()).toEqual(['open', 'waiting', 'resolved']);

    await user.click(chip('Waiting on me'));
    expect(rows()).toEqual(['waiting']);
    expect(screen.getByText(/2 other conversations hidden/)).toBeInTheDocument();
  });

  test('without a known viewer there is no "waiting on you"', () => {
    render(<PrConversationsTab pr={basePr(threads, { viewerLogin: '' })} />);
    expect(document.querySelector('.pr-conv-summary')).not.toHaveTextContent('waiting');
    expect(within(screen.getByRole('group', { name: 'Show' })).queryByRole('button', { name: /Waiting on me/ })).not.toBeInTheDocument();
  });

  test('a saved "Waiting on me" shows as Unresolved once the viewer is no longer known', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ReviewConversationsUiStateProvider>
        <PrConversationsTab pr={basePr(threads)} />
      </ReviewConversationsUiStateProvider>,
    );
    await user.click(chip('Waiting on me'));
    rerender(
      <ReviewConversationsUiStateProvider>
        <PrConversationsTab key="remount" pr={basePr(threads, { viewerLogin: '' })} />
      </ReviewConversationsUiStateProvider>,
    );
    expect(chip('Unresolved')).toHaveAttribute('aria-pressed', 'true');
    expect(rows()).toEqual(['open', 'waiting']);
  });

  test('each thread is one line - who, the start of its first comment, line, state, replies - that expands to its comments', async () => {
    const user = userEvent.setup();
    render(<PrConversationsTab pr={basePr(threads)} />);
    const row = screen.getByRole('button', { name: /Why this\?/ });
    expect(row).toHaveTextContent('me');
    expect(row).toHaveTextContent('L9');
    expect(row).toHaveTextContent('waiting on you');
    expect(row).toHaveTextContent('1 reply');
    expect(row).toHaveAttribute('aria-expanded', 'false');

    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    const body = row.closest('li')?.querySelector('.pr-conv-thread-body') as HTMLElement;
    expect(body.querySelectorAll('.pr-conv-comment')).toHaveLength(2);
    expect(body).toHaveTextContent('Because.');
  });

  test('a comment renders as markdown, and an unsubmitted one is marked Pending', async () => {
    const user = userEvent.setup();
    render(
      <PrConversationsTab
        pr={basePr([thread('t', [comment('bob', '2026-01-01T00:00:00Z', { path: 'x.ts', body: '**Bold** idea', state: 'PENDING' })])])}
      />,
    );
    const row = screen.getByRole('button', { name: /Bold idea/ });
    expect(row).toHaveTextContent('Pending');
    await user.click(row);
    expect(document.querySelector('.insight-thread-body strong')).toHaveTextContent('Bold');
  });

  test('links an open thread to GitHub', async () => {
    const user = userEvent.setup();
    render(<PrConversationsTab pr={basePr(threads)} />);
    await user.click(screen.getByRole('button', { name: /Rename it/ }));
    expect(screen.getByRole('link', { name: 'View this conversation on GitHub' })).toHaveAttribute('href', 'https://github.com/o/r/pull/7#d1');
  });

  test('a file group collapses and opens again', async () => {
    const user = userEvent.setup();
    render(<PrConversationsTab pr={basePr(threads)} />);
    const group = screen.getByRole('button', { name: /src\/a\.ts/ });
    await user.click(group);
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(rows()).toEqual([]);
    await user.click(group);
    expect(rows()).toEqual(['open', 'waiting']);
  });

  test('"Next unresolved" opens and focuses each unresolved thread in turn, showing one the filter hides', async () => {
    const user = userEvent.setup();
    render(<PrConversationsTab pr={basePr(threads)} />);
    await user.click(chip('Waiting on me'));

    await user.click(screen.getByRole('button', { name: 'Next unresolved' }));
    // The open thread isn't waiting on you: the filter goes back to Unresolved.
    expect(chip('Unresolved')).toHaveAttribute('aria-pressed', 'true');
    const openRow = screen.getByRole('button', { name: /Rename it/ });
    expect(openRow).toHaveAttribute('aria-expanded', 'true');
    expect(openRow).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Next unresolved' }));
    expect(screen.getByRole('button', { name: /Why this\?/ })).toHaveFocus();
  });

  test('"Next unresolved" opens the file group its thread is in', async () => {
    const user = userEvent.setup();
    render(<PrConversationsTab pr={basePr(threads)} />);
    const group = screen.getByRole('button', { name: /src\/a\.ts/ });
    await user.click(group);
    await user.click(screen.getByRole('button', { name: 'Next unresolved' }));
    expect(group).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Rename it/ })).toHaveFocus();
  });

  test('"Next unresolved" is disabled when nothing is unresolved', () => {
    render(<PrConversationsTab pr={basePr([threads[2] as ReviewThread])} />);
    expect(screen.getByRole('button', { name: 'Next unresolved' })).toBeDisabled();
    expect(screen.getByText('No unresolved conversations')).toBeInTheDocument();
  });

  describe('resolved by the wrong person', () => {
    // The PR author resolved a thread bob started, and bob is on the deny
    // list ("deny-only": the author may not resolve threads they started).
    const wrongPr = basePr([
      thread('wrong', [comment('bob', '2026-01-01T00:00:00Z', { path: 'x.ts', body: 'Fix this' }), comment('author', '2026-01-02T00:00:00Z')], {
        isResolved: true,
        resolvedByLogin: 'author',
      }),
    ]);
    const withPolicy = (children: ReactNode) => {
      const select = document.createElement('select');
      select.id = 'attention-author-thread-resolution-mode';
      select.innerHTML = '<option value="deny-only" selected>deny-only</option>';
      document.body.appendChild(select);
      return (
        <AuthorThreadResolutionSelectionContext.Provider
          value={{ checkedByListId: { 'attention-author-thread-resolution-deny-list': ['bob'] } } as never}
        >
          {children}
        </AuthorThreadResolutionSelectionContext.Provider>
      );
    };
    afterEach(() => document.getElementById('attention-author-thread-resolution-mode')?.remove());

    test('is counted in the summary, shown under Unresolved, and explained when opened', async () => {
      const user = userEvent.setup();
      render(withPolicy(<PrConversationsTab pr={wrongPr} />));
      expect(document.querySelector('.pr-conv-summary')).toHaveTextContent('1 resolved by the wrong person');
      expect(chip('Unresolved')).toHaveTextContent('1');
      const row = screen.getByRole('button', { name: /Fix this/ });
      expect(row).toHaveTextContent('resolved by the PR author');
      await user.click(row);
      expect(screen.getByText(/the person who started it should resolve it/)).toBeInTheDocument();
      expect(row.closest('li')).toHaveTextContent('Resolved by author');
    });

    test('"Next unresolved" goes to it, as Unresolved shows it', async () => {
      const user = userEvent.setup();
      render(withPolicy(<PrConversationsTab pr={wrongPr} />));
      const next = screen.getByRole('button', { name: 'Next unresolved' });
      expect(next).toBeEnabled();
      await user.click(next);
      const row = screen.getByRole('button', { name: /Fix this/ });
      expect(row).toHaveAttribute('aria-expanded', 'true');
      expect(row).toHaveFocus();
    });

    test('is not flagged under the default rule (the author may resolve any thread)', () => {
      render(<PrConversationsTab pr={wrongPr} />);
      expect(document.querySelector('.pr-conv-summary')).not.toHaveTextContent('wrong person');
      expect(screen.getByText(/1 resolved conversation hidden/)).toBeInTheDocument();
    });
  });

  test('lists the PR comments and review summaries in collapsed groups', () => {
    render(
      <PrConversationsTab
        pr={basePr([], {
          comments: [{ id: 'c1', authorLogin: 'amy', createdAt: '2026-01-01T00:00:00Z', body: 'Top-level note' }],
          reviews: [{ id: 'r1', authorLogin: 'bob', state: 'COMMENTED', submittedAt: '2026-01-02T00:00:00Z', body: 'Overall fine' }],
        })}
      />,
    );
    const comments = screen.getByText('PR comments (1)').closest('details') as HTMLDetailsElement;
    expect(comments.open).toBe(false);
    expect(comments).toHaveTextContent('Top-level note');
    expect(screen.getByText('Review summaries (1)').closest('details')).toHaveTextContent('bob reviewed');
    // No threads: no summary line or filters.
    expect(document.querySelector('.pr-conv-summary')).toBeNull();
  });

  test('says so when there are no conversations at all', () => {
    render(<PrConversationsTab pr={basePr([])} />);
    expect(screen.getByText('No conversations')).toBeInTheDocument();
  });
});
