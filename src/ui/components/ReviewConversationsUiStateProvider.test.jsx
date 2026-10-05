/** @jest-environment jsdom */

const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ReviewConversationsUiStateProvider } = require('./ReviewConversationsUiStateProvider');
const { ReviewThreadsSection } = require('./insights/ReviewThreadsSection');

// Phase 7 (see REACT_MIGRATION_PLAN.md): closes a real coverage gap - no
// existing test proved the filter-mode/summary-cards choice actually
// survives a real ReviewThreadsSection instance unmounting and
// remounting (the scenario this Provider exists for - collapsing and
// re-expanding a row's "More insights" panel). ReviewThreadsSection.test.jsx
// only ever renders one instance per test and never remounts it.
describe('ReviewConversationsUiStateProvider + ReviewThreadsSection wiring', () => {
  const pr = {
    repo: 'owner/repo',
    number: '42',
    reviewThreads: [
      { isResolved: false, comments: [{ authorLogin: 'alice', createdAt: '2026-01-01', body: 'open thread' }] },
      { isResolved: true, resolvedByLogin: 'bob', comments: [{ authorLogin: 'bob', createdAt: '2026-01-01', body: 'resolved thread' }] },
    ],
  };

  beforeEach(() => {
    window.asArray = (value) => (Array.isArray(value) ? value : []);
    window.getAuthorThreadResolutionPolicy = () => ({ mode: 'allow-all', allowLoginKeys: new Set(), denyLoginKeys: new Set() });
  });

  afterEach(() => {
    delete window.asArray;
    delete window.getAuthorThreadResolutionPolicy;
  });

  // Renders the Provider once and keeps that same instance (and its Map)
  // mounted throughout - only the inner ReviewThreadsSection is
  // mounted/unmounted via rerender, matching the real app's shape
  // (ReviewConversationsUiStateProvider mounts once around PrTableApp;
  // individual ReviewThreadsSection instances come and go as rows
  // expand/collapse). A fresh render() per "remount" would instead create
  // a brand-new Provider (and Map) each time, proving nothing.
  const renderWithToggleableSection = () => {
    const { rerender } = render(
      <ReviewConversationsUiStateProvider>
        <ReviewThreadsSection pr={pr} actorsMap={{}} />
      </ReviewConversationsUiStateProvider>,
    );
    const collapse = () => rerender(<ReviewConversationsUiStateProvider>{null}</ReviewConversationsUiStateProvider>);
    const expand = () =>
      rerender(
        <ReviewConversationsUiStateProvider>
          <ReviewThreadsSection pr={pr} actorsMap={{}} />
        </ReviewConversationsUiStateProvider>,
      );
    return { collapse, expand };
  };

  test('given the Resolved filter is picked, when the section collapses and re-expands, then the Resolved filter is still active', () => {
    const { collapse, expand } = renderWithToggleableSection();
    fireEvent.click(screen.getByRole('button', { name: 'Resolved (1)' }));
    expect(document.querySelector('.insight-thread-body')).toHaveTextContent('resolved thread');

    collapse();
    expand();

    expect(screen.getByRole('button', { name: 'Resolved (1)' })).toHaveClass('insight-thread-filter-btn-active');
    expect(document.querySelector('.insight-thread-body')).toHaveTextContent('resolved thread');
  });

  test('given the summary cards toggle is turned off, when the section collapses and re-expands, then it stays off', () => {
    const { collapse, expand } = renderWithToggleableSection();
    expect(screen.getByRole('button', { name: 'Summaries: On' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Summaries: On' }));
    expect(screen.getByRole('button', { name: 'Summaries: Off' })).toBeInTheDocument();

    collapse();
    expand();

    expect(screen.getByRole('button', { name: 'Summaries: Off' })).toBeInTheDocument();
  });

  test('given two different PRs under the same provider, when one sets its filter, then the other is unaffected', () => {
    const otherPr = { ...pr, repo: 'owner/other-repo', number: '7' };

    render(
      <ReviewConversationsUiStateProvider>
        <div data-testid="first">
          <ReviewThreadsSection pr={pr} actorsMap={{}} />
        </div>
        <div data-testid="second">
          <ReviewThreadsSection pr={otherPr} actorsMap={{}} />
        </div>
      </ReviewConversationsUiStateProvider>,
    );

    const firstSection = screen.getByTestId('first');
    const secondSection = screen.getByTestId('second');

    fireEvent.click(
      require('@testing-library/dom').within(firstSection).getByRole('button', { name: 'Resolved (1)' }),
    );

    expect(
      require('@testing-library/dom').within(firstSection).getByRole('button', { name: 'Resolved (1)' }),
    ).toHaveClass('insight-thread-filter-btn-active');
    expect(
      require('@testing-library/dom').within(secondSection).getByRole('button', { name: 'Unresolved (1)' }),
    ).toHaveClass('insight-thread-filter-btn-active');
  });

  test('given no ReviewConversationsUiStateProvider ancestor, when rendering and toggling, then it does not throw (safe default Context)', () => {
    render(<ReviewThreadsSection pr={pr} actorsMap={{}} />);

    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Resolved (1)' })),
    ).not.toThrow();
  });
});
