/** @jest-environment jsdom */

const { render, screen, act } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { FilterStateProvider: RealFilterStateProvider } = require('./FilterStateProvider');
const { useFilterState } = require('./FilterStateContext');
const { RowFilterSelectionProvider } = require('./RowFilterSelectionProvider');
const { AuthorThreadResolutionSelectionProvider } = require('./AuthorThreadResolutionSelectionProvider');
const { ChangeFilterActorSelectionProvider } = require('./ChangeFilterActorSelectionProvider');
const { useRowFilterSelection } = require('./RowFilterSelectionContext');
const { useAuthorThreadResolutionSelection } = require('./AuthorThreadResolutionSelectionContext');
const { useChangeFilterActorSelection } = require('./ChangeFilterActorSelectionContext');

// Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// FilterStateProvider's own buildOverrides() now calls
// useRowFilterSelection()/useAuthorThreadResolutionSelection()/
// useChangeFilterActorSelection() directly (all 3 throw without a real
// Provider ancestor) - every render() in this file needs these 3
// ancestors now, not just the persistence-focused tests further down.
function FilterStateProviderWithSelectionContexts({ initialValues, children }) {
  return (
    <RowFilterSelectionProvider>
      <AuthorThreadResolutionSelectionProvider>
        <ChangeFilterActorSelectionProvider>
          <RealFilterStateProvider initialValues={initialValues}>{children}</RealFilterStateProvider>
        </ChangeFilterActorSelectionProvider>
      </AuthorThreadResolutionSelectionProvider>
    </RowFilterSelectionProvider>
  );
}

function Probe() {
  const { values, setValue } = useFilterState();
  return (
    <div>
      <span data-testid="scope-mode-value">{values.scopeMode}</span>
      <span data-testid="always-show-value">{String(values.alwaysShowInReview)}</span>
      <button onClick={() => setValue('scopeMode', 'last-run')}>change scope</button>
    </div>
  );
}

// Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): mimics
// MultiSelectListPortals' own setChecked calls for the 3 Contexts
// buildOverrides() now reads directly, for the regression test below.
function MultiSelectSelectionProbe() {
  const rowFilterSelection = useRowFilterSelection();
  const authorThreadResolutionSelection = useAuthorThreadResolutionSelection();
  const changeFilterActorSelection = useChangeFilterActorSelection();
  return (
    <div>
      <button onClick={() => rowFilterSelection.setChecked('author-list', ['zuser'])}>
        check zuser (author)
      </button>
      <button
        onClick={() =>
          authorThreadResolutionSelection.setChecked(
            'attention-author-thread-resolution-allow-list',
            ['allowed-user'],
          )
        }
      >
        check allowed-user (thread resolution)
      </button>
      <button
        onClick={() =>
          changeFilterActorSelection.setChecked(
            'change-filter-ignore-comment-authors-list',
            ['ignored-user'],
          )
        }
      >
        check ignored-user (change filter)
      </button>
    </div>
  );
}

describe('FilterStateProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    delete window.getFilterStateValues;
    delete window.setFilterStateValue;
    delete window.debouncedApplyFilters;
    jest.useRealTimers();
  });

  test('given initialValues, when rendering, then children see them via useFilterState()', () => {
    render(
      <FilterStateProviderWithSelectionContexts initialValues={{ scopeMode: 'needs-attention', alwaysShowInReview: true }}>
        <Probe />
      </FilterStateProviderWithSelectionContexts>,
    );

    expect(screen.getByTestId('scope-mode-value')).toHaveTextContent('needs-attention');
    expect(screen.getByTestId('always-show-value')).toHaveTextContent('true');
  });

  test('given a value change, when it happens, then window.getFilterStateValues() reflects it', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(
      <FilterStateProviderWithSelectionContexts initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProviderWithSelectionContexts>,
    );

    await user.click(screen.getByText('change scope'));

    expect(window.getFilterStateValues().scopeMode).toBe('last-run');
  });

  test('given window.setFilterStateValue is called, when called, then it updates the shared state', () => {
    render(
      <FilterStateProviderWithSelectionContexts initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProviderWithSelectionContexts>,
    );

    act(() => {
      window.setFilterStateValue('scopeMode', 'needs-attention-or-interacted');
    });

    expect(screen.getByTestId('scope-mode-value')).toHaveTextContent(
      'needs-attention-or-interacted',
    );
  });

  test('given window.setFilterStateValue is called, when window.getFilterStateValues() is read immediately after with no act()/tick in between, then it reflects the new value synchronously', () => {
    // Phase 6, Slice 7 (see REACT_MIGRATION_PLAN.md): this is the exact
    // shape restoreUiOptionOverrides -> immediate re-populate-read
    // (index.page.js, for the multi-select "pending selections") exercises
    // in real vanilla code - a plain synchronous call, no React act()
    // wrapper, no awaited tick. Without flushSync-wrapping
    // window.setFilterStateValue, this would read stale (pre-update) state.
    render(
      <FilterStateProviderWithSelectionContexts initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProviderWithSelectionContexts>,
    );

    window.setFilterStateValue('scopeMode', 'needs-attention');
    expect(window.getFilterStateValues().scopeMode).toBe('needs-attention');
  });

  test('given a value change, when 150ms pass with no further change, then window.debouncedApplyFilters is called exactly once', async () => {
    window.debouncedApplyFilters = jest.fn();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(
      <FilterStateProviderWithSelectionContexts initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProviderWithSelectionContexts>,
    );

    await user.click(screen.getByText('change scope'));
    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(window.debouncedApplyFilters).toHaveBeenCalledTimes(1);
  });

  test('given a change to one of the Slice 2 attention fields, when 150ms pass, then window.debouncedApplyFilters is called', () => {
    window.debouncedApplyFilters = jest.fn();
    render(
      <FilterStateProviderWithSelectionContexts
        initialValues={{
          scopeMode: 'all',
          alwaysShowInReview: false,
          attentionNoActivityMode: 'all',
          attentionIncludePendingComments: false,
        }}
      >
        <Probe />
      </FilterStateProviderWithSelectionContexts>,
    );

    act(() => {
      window.setFilterStateValue('attentionIncludePendingComments', true);
    });
    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(window.debouncedApplyFilters).toHaveBeenCalledTimes(1);
  });

  test('given a change to filterPrNumbers or attentionAuthorThreadResolutionMode (Slice 5), when 150ms pass, then window.debouncedApplyFilters is called', () => {
    window.debouncedApplyFilters = jest.fn();
    render(
      <FilterStateProviderWithSelectionContexts
        initialValues={{
          scopeMode: 'all',
          alwaysShowInReview: false,
          filterPrNumbers: '',
          attentionAuthorThreadResolutionMode: 'allow-all',
        }}
      >
        <Probe />
      </FilterStateProviderWithSelectionContexts>,
    );

    act(() => {
      window.setFilterStateValue('filterPrNumbers', '42');
    });
    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(window.debouncedApplyFilters).toHaveBeenCalledTimes(1);
  });

  test('given no value change, when mounting, then window.debouncedApplyFilters is never called', () => {
    window.debouncedApplyFilters = jest.fn();
    render(
      <FilterStateProviderWithSelectionContexts initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProviderWithSelectionContexts>,
    );

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(window.debouncedApplyFilters).not.toHaveBeenCalled();
  });

  test('given rapid successive changes, when they happen within 150ms of each other, then window.debouncedApplyFilters is called only once (debounced)', () => {
    window.debouncedApplyFilters = jest.fn();
    render(
      <FilterStateProviderWithSelectionContexts initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProviderWithSelectionContexts>,
    );

    // Each setFilterStateValue call is its own act() (its own commit +
    // effect flush), matching two separate real user interactions - a
    // single act() covering both would let React batch them into one
    // render, which wouldn't actually exercise "cancel the pending timer
    // and reschedule" the way two distinct changes do in the browser.
    act(() => {
      window.setFilterStateValue('scopeMode', 'last-run');
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    act(() => {
      window.setFilterStateValue('scopeMode', 'needs-attention');
    });
    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(window.debouncedApplyFilters).toHaveBeenCalledTimes(1);
  });

  test('given unmount, when the component unmounts, then the window bridges are removed', () => {
    const { unmount } = render(
      <FilterStateProviderWithSelectionContexts initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProviderWithSelectionContexts>,
    );

    expect(typeof window.getFilterStateValues).toBe('function');
    unmount();
    expect(window.getFilterStateValues).toBeUndefined();
    expect(window.setFilterStateValue).toBeUndefined();
  });

  // Phase G.3 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"): the
  // real regression this phase fixes - buildOverrides() used to read these
  // 3 lists via window.getSelectedXxx DOM-scan bridges (agnostic to
  // whether any Context existed); now it reads
  // RowFilterSelectionContext/AuthorThreadResolutionSelectionContext/
  // ChangeFilterActorSelectionContext directly, which only resolves
  // correctly if MultiSelectListPortals (simulated here by
  // MultiSelectSelectionProbe) and FilterStateProvider are real siblings
  // under the same Provider instances - exactly the tree
  // FilterStateProviderWithSelectionContexts (and react-app.jsx's real
  // AppRoot, after this phase's Provider-tree reorder) now provides.
  describe('persisted overrides reflect the 3 selection Contexts directly', () => {
    let putBody;

    beforeEach(() => {
      putBody = null;
      global.fetch = jest.fn(async (url, init = {}) => {
        if (String(url) === '/view-prs/user-defaults' && !init.method) {
          return { ok: true, json: async () => ({ ok: true, overrides: {} }) };
        }
        if (String(url) === '/view-prs/user-defaults' && init.method === 'PUT') {
          putBody = JSON.parse(init.body);
          return { ok: true, json: async () => ({ ok: true }) };
        }
        return { ok: true, json: async () => ({ ok: true }) };
      });
    });

    afterEach(() => {
      delete global.fetch;
      delete window.persistViewFilterOptionOverrides;
    });

    test('given checked values set via each selection Context, when persistViewFilterOptionOverrides runs, then all 3 are included in the persisted overrides', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <FilterStateProviderWithSelectionContexts initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
          <MultiSelectSelectionProbe />
        </FilterStateProviderWithSelectionContexts>,
      );

      await user.click(screen.getByText('check zuser (author)'));
      await user.click(screen.getByText('check allowed-user (thread resolution)'));
      await user.click(screen.getByText('check ignored-user (change filter)'));

      await act(async () => {
        await window.persistViewFilterOptionOverrides();
      });

      expect(putBody.author).toEqual(['zuser']);
      expect(putBody['attention-author-thread-resolution-allow']).toEqual(['allowed-user']);
      expect(putBody.changeFilters.ignoreCommentsFromAuthors).toEqual(['ignored-user']);
    });
  });
});
