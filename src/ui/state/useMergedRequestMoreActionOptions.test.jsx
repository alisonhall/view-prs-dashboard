/** @jest-environment jsdom */

const { render, screen, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrDataProvider } = require('./PrDataProvider');
const { FilterStateProvider } = require('./FilterStateProvider');
const { useFilterState } = require('./FilterStateContext');
const { useMergedRequestMoreActionOptions } = require('./useMergedRequestMoreActionOptions');
const { RowFilterSelectionProvider } = require('./RowFilterSelectionProvider');
const { AuthorThreadResolutionSelectionProvider } = require('./AuthorThreadResolutionSelectionProvider');
const { ChangeFilterActorSelectionProvider } = require('./ChangeFilterActorSelectionProvider');

// Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// FilterStateProvider's own buildOverrides() now calls
// useRowFilterSelection()/useAuthorThreadResolutionSelection()/
// useChangeFilterActorSelection() directly (all 3 throw without a real
// Provider ancestor), so every FilterStateProvider render in this file
// needs them too - matching react-app.jsx's real AppRoot order
// (the 3 selection Providers wrap PrDataProvider/FilterStateProvider, not
// the other way around).
function AllSelectionProviders({ children }) {
  return (
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>{children}</ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>
  );
}

function Probe() {
  const { isVisible, repo } = useMergedRequestMoreActionOptions();
  return (
    <div>
      <span data-testid="is-visible">{String(isVisible)}</span>
      <span data-testid="repo">{repo}</span>
    </div>
  );
}

const renderProbe = ({ payload, selectedRepo, filterStateValues } = {}) =>
  render(
    <AllSelectionProviders>
      <PrDataProvider initialPayload={payload} initialSelectedRepo={selectedRepo}>
        <FilterStateProvider initialValues={{ scopeMode: 'all', ...filterStateValues }}>
          <Probe />
        </FilterStateProvider>
      </PrDataProvider>
    </AllSelectionProviders>,
  );

describe('useMergedRequestMoreActionOptions', () => {
  test('given scopeMode "all", a loaded payload, and a selectedRepo, when rendered, then isVisible is true and repo is the selectedRepo', () => {
    renderProbe({ payload: { ok: true }, selectedRepo: 'owner/repo', filterStateValues: { scopeMode: 'all' } });

    expect(screen.getByTestId('is-visible').textContent).toBe('true');
    expect(screen.getByTestId('repo').textContent).toBe('owner/repo');
  });

  test('given a non-"all" scopeMode, when rendered, then isVisible is false', () => {
    renderProbe({
      payload: { ok: true },
      selectedRepo: 'owner/repo',
      filterStateValues: { scopeMode: 'needs-attention' },
    });

    expect(screen.getByTestId('is-visible').textContent).toBe('false');
  });

  test('given no selectedRepo but a payload.lastRun.repo, when rendered, then repo falls back to lastRun.repo', () => {
    renderProbe({
      payload: { ok: true, lastRun: { repo: 'owner/last-run-repo' } },
      selectedRepo: '',
      filterStateValues: { scopeMode: 'all' },
    });

    expect(screen.getByTestId('repo').textContent).toBe('owner/last-run-repo');
  });

  test('given no <FilterStateProvider> ancestor, when rendered, then it falls back to scopeMode "all" without throwing', () => {
    render(
      <PrDataProvider initialPayload={{ ok: true }} initialSelectedRepo="owner/repo">
        <Probe />
      </PrDataProvider>,
    );

    expect(screen.getByTestId('is-visible').textContent).toBe('true');
    expect(screen.getByTestId('repo').textContent).toBe('owner/repo');
  });

  test('given scopeMode changes live via FilterStateContext, when read again, then isVisible recomputes without remounting', () => {
    function ToggleableProbe() {
      const { setValue } = useFilterState();
      const { isVisible } = useMergedRequestMoreActionOptions();
      return (
        <div>
          <span data-testid="is-visible">{String(isVisible)}</span>
          <button onClick={() => setValue('scopeMode', 'last-run')}>switch scope</button>
        </div>
      );
    }

    render(
      <AllSelectionProviders>
        <PrDataProvider initialPayload={{ ok: true }} initialSelectedRepo="owner/repo">
          <FilterStateProvider initialValues={{ scopeMode: 'all' }}>
            <ToggleableProbe />
          </FilterStateProvider>
        </PrDataProvider>
      </AllSelectionProviders>,
    );
    expect(screen.getByTestId('is-visible').textContent).toBe('true');

    act(() => {
      screen.getByText('switch scope').click();
    });
    expect(screen.getByTestId('is-visible').textContent).toBe('false');
  });

  // Regression test (found via code review): PrDataProvider always mounts
  // with initialPayload={} before the first /view-prs/data fetch resolves -
  // scopeMode's own real default is "all", so without the payload.ok guard
  // this would report isVisible: true (with repo: '') during that window,
  // where the old window.updateReactMergedRequestMoreAction-fed version
  // stayed explicitly hidden until the vanilla pipeline's first real render.
  test('given no payload has loaded yet (the initial empty seed, no "ok" field), when rendered, then isVisible is false even though scopeMode defaults to "all"', () => {
    renderProbe({ payload: {}, selectedRepo: 'owner/repo', filterStateValues: { scopeMode: 'all' } });

    expect(screen.getByTestId('is-visible').textContent).toBe('false');
  });
});
