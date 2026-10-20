/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useQuickCheckActions } = require('./useQuickCheckActions.jsx');
const { PrActivityQueueProvider } = require('../components/PrActivityQueueProvider');
const { usePrActivityQueue } = require('./PrActivityQueueContext');
const { FilterStateContext } = require('./FilterStateContext');
const { RowFilterSelectionContext } = require('./RowFilterSelectionContext');
const { SnackbarContext } = require('./SnackbarContext');

function Probe({ onReady }) {
  const actions = useQuickCheckActions();
  onReady(actions);
  return null;
}

// Phase H.20 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 6): useQuickCheckActions() now unconditionally calls
// useFormBody() (FilterStateContext/RowFilterSelectionContext), not
// window.getFormBody - every render in this file needs both Providers now,
// even the 2 tests that only call handleQuickCheckAll (which doesn't read
// the form body itself, but the hook's own top-level useFormBody() call
// still does).
const renderProbe = (onReady, values = {}, snackbar = {}) =>
  render(
    <FilterStateContext.Provider value={{ values }}>
      <RowFilterSelectionContext.Provider value={{ checkedByListId: {} }}>
        <SnackbarContext.Provider value={snackbar}>
          <Probe onReady={onReady} />
        </SnackbarContext.Provider>
      </RowFilterSelectionContext.Provider>
    </FilterStateContext.Provider>,
  );

const QUICK_CHECK_WINDOW_BRIDGES = ['renderSchedulerStatus', 'getLatestStoredPayload'];

describe('useQuickCheckActions', () => {
  afterEach(() => {
    QUICK_CHECK_WINDOW_BRIDGES.forEach((name) => delete window[name]);
    delete global.fetch;
  });

  // Phase H.24 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 1): window.loadSchedulerStatus is gone - the hook now builds
  // its own real pr-scheduler-status.helpers.js instance, which calls
  // fetch("/view-prs/scheduler") directly and forwards the result to
  // window.renderSchedulerStatus (the one piece of this still genuinely
  // vanilla/SSE-shared). Asserting the forced scheduler refresh fires
  // means asserting that fetch call, not a mocked bridge function.
  test('given a non-empty "PR number(s)" field, when handleQuickCheck is called, then it scopes the request to that repo/PR list, returns the success label, and forces a scheduler-status refresh', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, newPendingOpenCount: 2, newPendingMergedClosedCount: 1 }),
    });

    let actions;
    renderProbe((value) => { actions = value; }, { repo: 'owner/repo', prNumbersInput: '7,8' });

    let result;
    await act(async () => {
      result = await actions.handleQuickCheck();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/quick-check',
      expect.objectContaining({ body: JSON.stringify({ repo: 'owner/repo', prNumbers: '7,8' }) }),
    );
    expect(result).toEqual({ label: '3 updates found', resetAfterMs: 2500 });
    expect(global.fetch).toHaveBeenCalledWith('/view-prs/scheduler');
  });

  test('given a 409 (already in progress), when handleQuickCheck is called, then it shows the matching notification and returns the fallback label', async () => {
    const snackbarCalls = [];
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ ok: false }),
    });

    let actions;
    renderProbe((value) => { actions = value; }, {}, { showError: (...args) => snackbarCalls.push(args) });

    let result;
    await act(async () => {
      result = await actions.handleQuickCheck();
    });

    expect(result).toEqual({ label: 'Quick check' });
    expect(snackbarCalls).toHaveLength(1);
    expect(snackbarCalls[0][0]).toBe('Quick check already in progress');
  });

  test('given nothing loaded, when handleQuickCheckAll is called, then it reports nothing to check without firing a request', async () => {
    window.getLatestStoredPayload = () => ({ byPrNumber: {} });
    global.fetch = jest.fn();

    let actions;
    renderProbe((value) => { actions = value; });

    let result;
    await act(async () => {
      result = await actions.handleQuickCheckAll();
    });

    expect(result).toEqual({ label: 'Nothing to check', resetAfterMs: 2500 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('given PRs loaded across multiple repos, when handleQuickCheckAll is called, then each repo is marked busy via Context during the request and cleared after it resolves', async () => {
    window.getLatestStoredPayload = () => ({
      byPrNumber: {
        1: { repo: 'owner/repo-a', data: { number: '1' } },
        2: { repo: 'owner/repo-b', data: { number: '2' } },
      },
    });

    let resolveFetch;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    let actions;
    let activityQueue;
    function ProbeWithActivityQueue() {
      activityQueue = usePrActivityQueue();
      actions = useQuickCheckActions();
      return null;
    }

    render(
      <FilterStateContext.Provider value={{ values: {} }}>
        <RowFilterSelectionContext.Provider value={{ checkedByListId: {} }}>
          <PrActivityQueueProvider>
            <ProbeWithActivityQueue />
          </PrActivityQueueProvider>
        </RowFilterSelectionContext.Provider>
      </FilterStateContext.Provider>,
    );

    let checkAllPromise;
    act(() => {
      checkAllPromise = actions.handleQuickCheckAll();
    });

    // Mid-flight (fetch still pending): Context, not a dropped window.*
    // no-op, is what marked these PRs busy.
    expect(activityQueue.busyPrNumbers.has('owner/repo-a::1')).toBe(true);
    expect(activityQueue.busyPrNumbers.has('owner/repo-b::2')).toBe(true);

    await act(async () => {
      resolveFetch({ ok: true, status: 200, json: async () => ({ ok: true }) });
      await checkAllPromise;
    });

    expect(activityQueue.busyPrNumbers.size).toBe(0);
  });
});
