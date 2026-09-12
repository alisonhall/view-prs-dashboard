/** @jest-environment jsdom */

const React = require('react');
const { render, screen, act } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { FilterStateProvider } = require('./FilterStateProvider');
const { useFilterState } = require('./FilterStateContext');

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
      <FilterStateProvider initialValues={{ scopeMode: 'needs-attention', alwaysShowInReview: true }}>
        <Probe />
      </FilterStateProvider>,
    );

    expect(screen.getByTestId('scope-mode-value')).toHaveTextContent('needs-attention');
    expect(screen.getByTestId('always-show-value')).toHaveTextContent('true');
  });

  test('given a value change, when it happens, then window.getFilterStateValues() reflects it', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(
      <FilterStateProvider initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProvider>,
    );

    await user.click(screen.getByText('change scope'));

    expect(window.getFilterStateValues().scopeMode).toBe('last-run');
  });

  test('given window.setFilterStateValue is called, when called, then it updates the shared state', () => {
    render(
      <FilterStateProvider initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProvider>,
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
      <FilterStateProvider initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProvider>,
    );

    window.setFilterStateValue('scopeMode', 'needs-attention');
    expect(window.getFilterStateValues().scopeMode).toBe('needs-attention');
  });

  test('given a value change, when 150ms pass with no further change, then window.debouncedApplyFilters is called exactly once', async () => {
    window.debouncedApplyFilters = jest.fn();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(
      <FilterStateProvider initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProvider>,
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
      <FilterStateProvider
        initialValues={{
          scopeMode: 'all',
          alwaysShowInReview: false,
          attentionNoActivityMode: 'all',
          attentionIncludePendingComments: false,
        }}
      >
        <Probe />
      </FilterStateProvider>,
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
      <FilterStateProvider
        initialValues={{
          scopeMode: 'all',
          alwaysShowInReview: false,
          filterPrNumbers: '',
          attentionAuthorThreadResolutionMode: 'allow-all',
        }}
      >
        <Probe />
      </FilterStateProvider>,
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
      <FilterStateProvider initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProvider>,
    );

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(window.debouncedApplyFilters).not.toHaveBeenCalled();
  });

  test('given rapid successive changes, when they happen within 150ms of each other, then window.debouncedApplyFilters is called only once (debounced)', () => {
    window.debouncedApplyFilters = jest.fn();
    render(
      <FilterStateProvider initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProvider>,
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
      <FilterStateProvider initialValues={{ scopeMode: 'all', alwaysShowInReview: false }}>
        <Probe />
      </FilterStateProvider>,
    );

    expect(typeof window.getFilterStateValues).toBe('function');
    unmount();
    expect(window.getFilterStateValues).toBeUndefined();
    expect(window.setFilterStateValue).toBeUndefined();
  });
});
