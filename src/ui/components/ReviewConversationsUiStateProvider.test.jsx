/** @jest-environment jsdom */

const { render, screen, fireEvent, within } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ReviewConversationsUiStateProvider } = require('./ReviewConversationsUiStateProvider');
const { PrConversationsTab } = require('./pane/PrConversationsTab');

// Proves the Conversations tab's filter survives the tab unmounting and
// remounting (the scenario this Provider exists for - the detail pane
// gives each PR fresh tab content, and switching tabs unmounts it).
describe('ReviewConversationsUiStateProvider + PrConversationsTab wiring', () => {
  const pr = {
    repo: 'owner/repo',
    number: '42',
    reviewThreads: [
      { id: 'open', isResolved: false, comments: [{ authorLogin: 'alice', createdAt: '2026-01-01', body: 'open thread' }] },
      { id: 'done', isResolved: true, resolvedByLogin: 'bob', comments: [{ authorLogin: 'bob', createdAt: '2026-01-01', body: 'resolved thread' }] },
    ],
  };

  // No FilterStateContext/AuthorThreadResolutionSelectionContext ancestor
  // needed - both default to the "allow-all, nothing checked" policy (see
  // useAuthorThreadResolutionPolicy).

  // Renders the Provider once and keeps that same instance (and its Map)
  // mounted throughout - only the tab is unmounted/remounted via rerender,
  // as in the real app (the Provider mounts once around PrTableApp). A
  // fresh render() per "remount" would create a new Provider (and Map),
  // proving nothing.
  const renderWithToggleableTab = () => {
    const { rerender } = render(
      <ReviewConversationsUiStateProvider>
        <PrConversationsTab pr={pr} actorsMap={{}} />
      </ReviewConversationsUiStateProvider>,
    );
    const unmountTab = () => rerender(<ReviewConversationsUiStateProvider>{null}</ReviewConversationsUiStateProvider>);
    const remountTab = () =>
      rerender(
        <ReviewConversationsUiStateProvider>
          <PrConversationsTab pr={pr} actorsMap={{}} />
        </ReviewConversationsUiStateProvider>,
      );
    return { unmountTab, remountTab };
  };

  const chip = (scope, name) => within(scope).getByRole('button', { name: new RegExp(`^${name}`) });

  test('given the All filter is picked, when the tab unmounts and comes back, then All is still picked', () => {
    const { unmountTab, remountTab } = renderWithToggleableTab();
    fireEvent.click(chip(document.body, 'All'));
    expect(screen.getByText('resolved thread')).toBeInTheDocument();

    unmountTab();
    remountTab();

    expect(chip(document.body, 'All')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('resolved thread')).toBeInTheDocument();
  });

  test('given two different PRs under the same provider, when one sets its filter, then the other is unaffected', () => {
    const otherPr = { ...pr, repo: 'owner/other-repo', number: '7' };

    render(
      <ReviewConversationsUiStateProvider>
        <div data-testid="first">
          <PrConversationsTab pr={pr} actorsMap={{}} />
        </div>
        <div data-testid="second">
          <PrConversationsTab pr={otherPr} actorsMap={{}} />
        </div>
      </ReviewConversationsUiStateProvider>,
    );

    fireEvent.click(chip(screen.getByTestId('first'), 'All'));

    expect(chip(screen.getByTestId('first'), 'All')).toHaveAttribute('aria-pressed', 'true');
    expect(chip(screen.getByTestId('second'), 'Unresolved')).toHaveAttribute('aria-pressed', 'true');
  });

  test('given no ReviewConversationsUiStateProvider ancestor, when rendering and changing the filter, then it does not throw (safe default Context)', () => {
    render(<PrConversationsTab pr={pr} actorsMap={{}} />);

    expect(() => fireEvent.click(chip(document.body, 'All'))).not.toThrow();
  });
});
