/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useQuickCheckActions } = require('./useQuickCheckActions.jsx');
const { PrActivityQueueProvider } = require('../components/PrActivityQueueProvider');
const { usePrActivityQueue } = require('./PrActivityQueueContext');

function Probe({ onReady }) {
  const actions = useQuickCheckActions();
  onReady(actions);
  return null;
}

const QUICK_CHECK_WINDOW_BRIDGES = [
  'showErrorNotification',
  'showWarningNotification',
  'loadSchedulerStatus',
  'getFormBody',
  'getLatestStoredPayload',
];

describe('useQuickCheckActions', () => {
  afterEach(() => {
    QUICK_CHECK_WINDOW_BRIDGES.forEach((name) => delete window[name]);
    delete global.fetch;
  });

  test('given a non-empty "PR number(s)" field, when handleQuickCheck is called, then it scopes the request to that repo/PR list and returns the success label', async () => {
    window.getFormBody = () => ({ repo: 'owner/repo', prNumbers: '7,8' });
    const loadSchedulerStatus = jest.fn();
    window.loadSchedulerStatus = loadSchedulerStatus;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, newPendingOpenCount: 2, newPendingMergedClosedCount: 1 }),
    });

    let actions;
    render(<Probe onReady={(value) => { actions = value; }} />);

    let result;
    await act(async () => {
      result = await actions.handleQuickCheck();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/quick-check',
      expect.objectContaining({ body: JSON.stringify({ repo: 'owner/repo', prNumbers: '7,8' }) }),
    );
    expect(result).toEqual({ label: '3 updates found', resetAfterMs: 2500 });
    expect(loadSchedulerStatus).toHaveBeenCalled();
  });

  test('given a 409 (already in progress), when handleQuickCheck is called, then it shows the matching notification and returns the fallback label', async () => {
    window.getFormBody = () => ({ repo: '', prNumbers: '' });
    const snackbarCalls = [];
    window.showErrorNotification = (...args) => snackbarCalls.push(args);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ ok: false }),
    });

    let actions;
    render(<Probe onReady={(value) => { actions = value; }} />);

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
    render(<Probe onReady={(value) => { actions = value; }} />);

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
      <PrActivityQueueProvider>
        <ProbeWithActivityQueue />
      </PrActivityQueueProvider>,
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
