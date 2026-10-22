/** @jest-environment jsdom */

const React = require('react');
const { render, screen, fireEvent, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AutoRenderBlockedLinks, AutoRenderBlockedLinksLive } = require('./AutoRenderBlockedLinks');
const { AutoRenderBlockingProvider } = require('./AutoRenderBlockingProvider');
const { useAutoRenderBlockingActions } = require('../state/AutoRenderBlockingContext');
const { AuthorInsightsContext, defaultAuthorInsights } = require('../state/AuthorInsightsContext');
const { TabStateProvider } = require('./TabStateProvider');
const { useTabState } = require('../state/TabStateContext');
const { PrDataProvider } = require('../state/PrDataProvider');
const { usePrData } = require('../state/PrDataContext');

// Phase G.1 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// AutoRenderBlockedLinks.jsx now calls real hooks (useNavigateToPrInTable/
// useNavigateToAuthorInsights) instead of window.navigateToPrInTable/
// navigateToAuthorInsights - this harness wraps real TabStateProvider/
// PrDataProvider (the hooks' own real dependencies) and exposes their
// current values via a Probe, same shape every other hook test in this
// migration uses.
let latestTabState;
let latestPrData;
function Probe() {
  latestTabState = useTabState();
  latestPrData = usePrData();
  return null;
}

const renderWithOverrides = (ui, authorInsightsOverrides = {}, { initialPayload } = {}) =>
  render(
    React.createElement(
      PrDataProvider,
      { initialPayload },
      React.createElement(
        TabStateProvider,
        null,
        React.createElement(
          AuthorInsightsContext.Provider,
          { value: { ...defaultAuthorInsights, ...authorInsightsOverrides } },
          React.createElement(Probe),
          ui,
        ),
      ),
    ),
  );

describe('AutoRenderBlockedLinks', () => {
  afterEach(() => {
    latestTabState = undefined;
    latestPrData = undefined;
  });

  test('given no PR numbers or author logins, when rendering, then nothing renders', () => {
    const { container } = render(
      React.createElement(
        PrDataProvider,
        null,
        React.createElement(
          TabStateProvider,
          null,
          React.createElement(
            AuthorInsightsContext.Provider,
            { value: defaultAuthorInsights },
            React.createElement(AutoRenderBlockedLinks, { prNumbers: [], authorLogins: [] }),
          ),
        ),
      ),
    );
    expect(container.querySelector('button')).toBeNull();
  });

  test('given PR numbers, when rendering, then a chip is shown per PR number', () => {
    renderWithOverrides(React.createElement(AutoRenderBlockedLinks, { prNumbers: ['15', '22'], authorLogins: [] }));
    expect(screen.getByRole('button', { name: '#15' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#22' })).toBeInTheDocument();
  });

  test('given a PR number chip, when clicked, then it switches to the pr-data tab and dispatches pr-navigate-to-insights with focusUnsaved', () => {
    const events = [];
    const handler = (event) => events.push(event.detail);
    window.addEventListener('pr-navigate-to-insights', handler);

    renderWithOverrides(React.createElement(AutoRenderBlockedLinks, { prNumbers: ['15'], authorLogins: [] }));

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '#15' }));
    });

    expect(latestTabState.activeDataTab).toBe('pr-data');
    expect(events).toEqual([{ prNumber: '15', repo: '', focusUnsaved: true }]);

    window.removeEventListener('pr-navigate-to-insights', handler);
  });

  test('given author logins, when rendering, then a chip using the resolved display name is shown per author', () => {
    renderWithOverrides(React.createElement(AutoRenderBlockedLinks, { prNumbers: [], authorLogins: ['alice'] }), {
      getAuthorInsightsDisplayName: (login) => ({ alice: 'Alice A' }[login] || login),
    });

    expect(screen.getByRole('button', { name: 'Author: Alice A' })).toBeInTheDocument();
  });

  test('given an author chip, when clicked, then it switches to the author-insights tab and writes the validated selected author', () => {
    renderWithOverrides(
      React.createElement(AutoRenderBlockedLinks, { prNumbers: [], authorLogins: ['alice'] }),
      {
        getAuthorInsightsDisplayName: (login) => login,
        buildAuthorInsightsEntries: () => [{ login: 'alice' }],
      },
      { initialPayload: { byPrNumber: { 1: {} }, actorsMap: {} } },
    );

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Author: alice' }));
    });

    expect(latestTabState.activeDataTab).toBe('author-insights');
    expect(latestPrData.selectedAuthorLogin).toBe('alice');
  });

  test('given the requested author no longer exists in the current options, when clicked, then it falls back to the first valid option instead of writing the stale login', () => {
    renderWithOverrides(
      React.createElement(AutoRenderBlockedLinks, { prNumbers: [], authorLogins: ['stale-login'] }),
      {
        getAuthorInsightsDisplayName: (login) => login,
        buildAuthorInsightsEntries: () => [{ login: 'alice' }],
      },
      { initialPayload: { byPrNumber: { 1: {} }, actorsMap: {} } },
    );

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Author: stale-login' }));
    });

    expect(latestPrData.selectedAuthorLogin).toBe('alice');
  });
});

// Window-bridge elimination Phase 7.4: AutoRenderBlockedLinksLive reads the
// blocking lists from a real AutoRenderBlockingProvider and sets its
// container's hidden/aria-label - what index.page.js's
// renderAutoRenderBlockedLinks (and its deleted helper tests) used to do.
describe('AutoRenderBlockedLinksLive', () => {
  let blockingActions;
  function CaptureBlockingActions() {
    blockingActions = useAutoRenderBlockingActions();
    return null;
  }
  const EMPTY = {
    dirtyFieldCount: 0,
    unsavedNotesCount: 0,
    blockingPrNumbers: [],
    blockingAuthorInsightsLogins: [],
    blockingPrLabel: '',
  };

  const renderLive = (authorInsightsOverrides = {}) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderWithOverrides(
      React.createElement(
        AutoRenderBlockingProvider,
        null,
        React.createElement(CaptureBlockingActions),
        React.createElement(AutoRenderBlockedLinksLive, { container }),
      ),
      authorInsightsOverrides,
    );
    return container;
  };

  afterEach(() => {
    blockingActions = undefined;
    document.body.innerHTML = '';
  });

  test('given nothing blocks, when mounted, then the container is hidden with an empty label and no chips', () => {
    const container = renderLive();

    expect(container.hidden).toBe(true);
    expect(container.getAttribute('aria-label')).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('given blocking PRs, when the state is pushed, then the container unhides, is labelled with the PR label, and shows a chip per PR', () => {
    const container = renderLive();

    act(() => {
      blockingActions.setBlockingState({
        ...EMPTY,
        unsavedNotesCount: 2,
        blockingPrNumbers: ['7', '42'],
        blockingPrLabel: 'Blocking PRs: #7, #42',
      });
    });

    expect(container.hidden).toBe(false);
    expect(container.getAttribute('aria-label')).toBe('Blocking PRs: #7, #42');
    expect(screen.getByRole('button', { name: '#7' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#42' })).toBeInTheDocument();
  });

  test('given only blocking authors, when the state is pushed, then the label lists their display names', () => {
    const container = renderLive({
      getAuthorInsightsDisplayName: (login) => ({ alice: 'Alice A', bob: 'Bob B' }[login] || login),
    });

    act(() => {
      blockingActions.setBlockingState({ ...EMPTY, blockingAuthorInsightsLogins: ['alice', 'bob'] });
    });

    expect(container.hidden).toBe(false);
    expect(container.getAttribute('aria-label')).toBe('Blocking author drafts: Alice A, Bob B');
    expect(screen.getByRole('button', { name: 'Author: Alice A' })).toBeInTheDocument();
  });

  test('given the blocking edits are saved, when the empty state is pushed, then the container hides again', () => {
    const container = renderLive();
    act(() => {
      blockingActions.setBlockingState({ ...EMPTY, blockingPrNumbers: ['7'], blockingPrLabel: 'Blocking PRs: #7' });
    });
    expect(container.hidden).toBe(false);

    act(() => {
      blockingActions.setBlockingState(EMPTY);
    });

    expect(container.hidden).toBe(true);
    expect(container.getAttribute('aria-label')).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
