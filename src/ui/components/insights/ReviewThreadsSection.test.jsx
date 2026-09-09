/** @jest-environment jsdom */

const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ReviewThreadsSection } = require('./ReviewThreadsSection');

function installDefaultHelpers() {
  window.asArray = (value) => (Array.isArray(value) ? value : []);
  window.getPreferredActorKey = (login, name) => String(login || name || '').trim();
  window.resolveActorDisplayName = (login, _actorsMap, fallback) => fallback || login || '';
  window.getAuthorThreadResolutionPolicy = () => ({ mode: 'allow-all', allowLoginKeys: new Set(), denyLoginKeys: new Set() });
  window.parseSortableTime = (value) => Date.parse(String(value || '')) || 0;
  window.formatIsoDatetime = (value) => String(value || '-');
  window.renderMarkdownAsHtml = (text) => `<p>${text}</p>`;
  window.readReviewConversationsUiState = () => ({ stateKey: 'k', conversationFilterMode: 'unresolved', showSummaryCards: true });
  window.writeReviewConversationsUiState = () => {};
}

function clearHelpers() {
  [
    'asArray',
    'getPreferredActorKey',
    'resolveActorDisplayName',
    'getAuthorThreadResolutionPolicy',
    'parseSortableTime',
    'formatIsoDatetime',
    'renderMarkdownAsHtml',
    'readReviewConversationsUiState',
    'writeReviewConversationsUiState',
  ].forEach((key) => delete window[key]);
}

describe('ReviewThreadsSection', () => {
  beforeEach(installDefaultHelpers);
  afterEach(clearHelpers);

  test('given no threads/comments/summaries, when rendering, then renders nothing', () => {
    const { container } = render(<ReviewThreadsSection pr={{}} actorsMap={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test('given unresolved and resolved threads, when rendering, then defaults to the Unresolved filter', () => {
    const pr = {
      reviewThreads: [
        { isResolved: false, comments: [{ authorLogin: 'alice', createdAt: '2026-01-01', body: 'open thread' }] },
        { isResolved: true, resolvedByLogin: 'bob', comments: [{ authorLogin: 'bob', createdAt: '2026-01-01', body: 'resolved thread' }] },
      ],
    };
    render(<ReviewThreadsSection pr={pr} actorsMap={{}} />);
    expect(document.querySelector('.insight-thread-body')).toHaveTextContent('open thread');
    expect(screen.queryByText('resolved thread', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unresolved (1)' })).toHaveClass('insight-thread-filter-btn-active');
  });

  test('given the Resolved filter button, when clicked, then shows resolved threads instead', () => {
    const pr = {
      reviewThreads: [
        { isResolved: false, comments: [{ authorLogin: 'alice', createdAt: '2026-01-01', body: 'open thread' }] },
        { isResolved: true, resolvedByLogin: 'bob', comments: [{ authorLogin: 'bob', createdAt: '2026-01-01', body: 'resolved thread' }] },
      ],
    };
    render(<ReviewThreadsSection pr={pr} actorsMap={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resolved (1)' }));
    expect(document.querySelector('.insight-thread-body')).toHaveTextContent('resolved thread');
    expect(screen.queryByText('open thread', { exact: false })).not.toBeInTheDocument();
  });

  test('given a thread resolved by the PR author whose starter is on the deny list, when rendering, then flags the warning', () => {
    // "allow-all" (the default policy) never flags an author-resolved thread
    // regardless of who started it — the warning only exists for the
    // "deny-only" (or "allow-only") policies, matching vanilla exactly.
    window.getAuthorThreadResolutionPolicy = () => ({
      mode: 'deny-only',
      allowLoginKeys: new Set(),
      denyLoginKeys: new Set(['someone-else']),
    });
    const pr = {
      authorLogin: 'author-login',
      reviewThreads: [
        {
          isResolved: true,
          resolvedByLogin: 'author-login',
          comments: [{ authorLogin: 'someone-else', createdAt: '2026-01-01', body: 'started by someone else' }],
        },
      ],
    };
    render(<ReviewThreadsSection pr={pr} actorsMap={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resolved (1)' }));
    expect(screen.getByText('WARNING: should be resolved by thread starter', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/incorrectly resolved by PR author/)).toBeInTheDocument();
  });

  test('given the Summaries toggle, when clicked, then hides the summary cards', () => {
    const pr = {
      comments: [{ id: 'c1', authorLogin: 'alice', createdAt: '2026-01-01', body: 'top level comment' }],
      // The filter/summary-toggle buttons only render when there's at least
      // one review thread (matches vanilla).
      reviewThreads: [{ isResolved: false, comments: [{ authorLogin: 'bob', createdAt: '2026-01-01', body: 'a thread comment' }] }],
    };
    render(<ReviewThreadsSection pr={pr} actorsMap={{}} />);
    expect(screen.getByText('top level comment', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Summaries: On' }));
    expect(screen.queryByText('top level comment', { exact: false })).not.toBeInTheDocument();
  });
});
