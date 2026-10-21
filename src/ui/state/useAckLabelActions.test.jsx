/** @jest-environment jsdom */

const React = require('react');
const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useAckLabelActions } = require('./useAckLabelActions.jsx');
const { PrDataContext } = require('./PrDataContext');
const { PrActivityQueueProvider } = require('../components/PrActivityQueueProvider');
const { usePrActivityQueue } = require('./PrActivityQueueContext');
const { StatusTextContext } = require('./StatusTextContext');
const { FilterStateContext } = require('./FilterStateContext');
const { RowFilterSelectionContext } = require('./RowFilterSelectionContext');

function Probe({ onReady }) {
  const ackLabelActions = useAckLabelActions();
  onReady(ackLabelActions);
  return null;
}

// Window-bridge elimination Phase 3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// beginRequestActivity/renderRequestActivity come from usePrData() now, not
// window.beginRequestActivity/renderRequestActivity.
const makeActivity = () => ({ beginRequestActivity: () => () => {}, renderRequestActivity: () => {} });
let activity = makeActivity();

// Phase H.8 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// statusText now comes from StatusTextContext directly, not
// window.setStatusMessage - render Probe inside a real Provider value
// instead of mocking the old bridge.
//
// Phase H.20 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 6): useAckLabelActions() now reads its form body via
// useFormBody() (FilterStateContext/RowFilterSelectionContext), not
// window.getFormBody - seed real Provider values instead of stubbing that
// bridge.
const renderProbe = (onReady, { setStatusText = () => {}, values = {}, checkedByListId = {} } = {}) =>
  render(
    React.createElement(
      FilterStateContext.Provider,
      { value: { values } },
      React.createElement(
        RowFilterSelectionContext.Provider,
        { value: { checkedByListId } },
        React.createElement(
          StatusTextContext.Provider,
          { value: { statusText: 'Not run', setStatusText } },
          React.createElement(
            PrDataContext.Provider,
            { value: activity },
            React.createElement(Probe, { onReady }),
          ),
        ),
      ),
    ),
  );

// Phase G (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// useAckLabelActions() now reads busy/queued/bulk-batch state via
// usePrActivityQueue() (Context) instead of window.markPrsBusy/
// beginBulkActionBatch/etc. - without a real Provider mounted, the
// Context's own no-op defaults (PrActivityQueueContext.jsx) are used
// automatically, so the 3 tests below (which don't exercise busy/queued
// behavior directly) need no Provider wrapper to keep passing.
const ACK_LABEL_WINDOW_BRIDGES = [
  'updateReactOutputText',
  'summarizeAckRefreshWarnings',
  'applyFreshPrPayload',
  'loadStoredData',
  'getLatestStoredPayload',
];

describe('useAckLabelActions', () => {
  afterEach(() => {
    ACK_LABEL_WINDOW_BRIDGES.forEach((name) => delete window[name]);
    activity = makeActivity();
    delete global.fetch;
  });

  test('given a single PR number from the form, when calling handleAckOnly, then it posts to /view-prs/ack and applies the fresh payload directly', async () => {
    const statusMessages = [];
    const applyFreshPrPayload = jest.fn();
    window.updateReactOutputText = jest.fn();
    window.applyFreshPrPayload = applyFreshPrPayload;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, prData: { byPrNumber: { 42: {} } } }),
    });

    let ackLabelActions;
    renderProbe((value) => { ackLabelActions = value; }, {
      setStatusText: (message) => statusMessages.push(message),
      values: { prNumbersInput: '42', repo: 'org/repo' },
    });
    await act(async () => {
      await ackLabelActions.handleAckOnly();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/ack',
      expect.objectContaining({
        body: JSON.stringify({ repo: 'org/repo', ack: '42' }),
      }),
    );
    expect(statusMessages).toContain('Ack only completed');
    expect(applyFreshPrPayload).toHaveBeenCalledWith({ byPrNumber: { 42: {} } }, 'org/repo');
  });

  test('given no PR numbers anywhere, when calling handleClearOnly, then it bails early with a validation message and never fetches', async () => {
    const statusMessages = [];
    global.fetch = jest.fn();

    let ackLabelActions;
    renderProbe((value) => { ackLabelActions = value; }, {
      setStatusText: (message) => statusMessages.push(message),
      values: { prNumbersInput: '', repo: '' },
    });
    await act(async () => {
      await ackLabelActions.handleClearOnly();
    });

    expect(statusMessages).toEqual(['Clear only requires numeric value(s) in "PR number(s)"']);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('given a real #apply-label-select element, when calling handleApplyLabelClick, then it reads the select value and posts to /view-prs/labels/apply', async () => {
    const select = document.createElement('select');
    select.id = 'apply-label-select';
    const option = document.createElement('option');
    option.value = 'bug';
    option.selected = true;
    select.appendChild(option);
    document.body.appendChild(select);

    window.updateReactOutputText = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, prData: null }),
    });
    window.loadStoredData = jest.fn().mockResolvedValue(undefined);
    window.getLatestStoredPayload = jest.fn().mockReturnValue({ byPrNumber: {} });

    let ackLabelActions;
    renderProbe((value) => { ackLabelActions = value; }, {
      values: { prNumbersInput: '42', repo: 'org/repo' },
    });
    await act(async () => {
      await ackLabelActions.handleApplyLabelClick();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/labels/apply',
      expect.objectContaining({
        body: JSON.stringify({ repo: 'org/repo', label: 'bug', prNumbers: '42' }),
      }),
    );

    document.body.removeChild(select);
  });

  test('given a real PrActivityQueueProvider, when calling handleAckOnly, then the PR is marked busy via Context during the request and cleared after it resolves', async () => {
    window.updateReactOutputText = jest.fn();

    let resolveFetch;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    let ackLabelActions;
    let activityQueue;
    function ProbeWithActivityQueue() {
      activityQueue = usePrActivityQueue();
      ackLabelActions = useAckLabelActions();
      return null;
    }

    render(
      React.createElement(
        FilterStateContext.Provider,
        { value: { values: { prNumbersInput: '42', repo: 'org/repo' } } },
        React.createElement(
          RowFilterSelectionContext.Provider,
          { value: { checkedByListId: {} } },
          React.createElement(
            StatusTextContext.Provider,
            { value: { statusText: 'Not run', setStatusText: () => {} } },
            React.createElement(
              PrDataContext.Provider,
              { value: activity },
              React.createElement(PrActivityQueueProvider, null, React.createElement(ProbeWithActivityQueue)),
            ),
          ),
        ),
      ),
    );

    let ackPromise;
    act(() => {
      ackPromise = ackLabelActions.handleAckOnly();
    });

    // Mid-flight (fetch still pending): Context, not a dropped window.*
    // no-op, is what marked this PR busy.
    expect(activityQueue.busyPrNumbers.has('org/repo::42')).toBe(true);

    await act(async () => {
      resolveFetch({ ok: true, status: 200, json: async () => ({ ok: true, prData: null }) });
      await ackPromise;
    });

    expect(activityQueue.busyPrNumbers.has('org/repo::42')).toBe(false);
  });
});
