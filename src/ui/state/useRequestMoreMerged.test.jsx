/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useRequestMoreMerged } = require('./useRequestMoreMerged.jsx');
const { StatusTextContext } = require('./StatusTextContext');
const { SnackbarContext } = require('./SnackbarContext');
const { PrDataContext } = require('./PrDataContext');

function Probe({ onReady }) {
  onReady(useRequestMoreMerged());
  return null;
}

// beginRequestActivity/renderRequestActivity come from usePrData() (Window-bridge
// elimination Phase 3, see WINDOW_BRIDGE_ELIMINATION_PLAN.md), so this renders
// the hook inside a real PrDataContext value and asserts on those functions
// instead of stubbing window.beginRequestActivity/renderRequestActivity.
const renderProbe = (onReady, { activity, setStatusText = () => {}, showError = () => {} }) =>
  render(
    <StatusTextContext.Provider value={{ statusText: '', setStatusText }}>
      <SnackbarContext.Provider value={{ showError }}>
        <PrDataContext.Provider value={activity}>
          <Probe onReady={onReady} />
        </PrDataContext.Provider>
      </SnackbarContext.Provider>
    </StatusTextContext.Provider>,
  );

describe('useRequestMoreMerged', () => {
  afterEach(() => {
    delete window.beginRequestActivity;
    delete window.renderRequestActivity;
    delete window.applyFreshPrPayload;
    delete window.loadStoredData;
    delete global.fetch;
  });

  test('given a successful request, when called, then it tracks activity and refreshes the status text through the PrData Context, not window bridges', async () => {
    const finishActivity = jest.fn();
    const beginRequestActivity = jest.fn(() => finishActivity);
    const renderRequestActivity = jest.fn();
    const statusMessages = [];
    // Sentinels that must NOT be used: the old window bridges.
    window.beginRequestActivity = jest.fn(() => jest.fn());
    window.renderRequestActivity = jest.fn();
    window.applyFreshPrPayload = jest.fn();
    window.loadStoredData = jest.fn().mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, refreshedPrs: [{ number: 1 }, { number: 2 }] }),
    });

    let requestMoreMerged;
    renderProbe(
      (fn) => {
        requestMoreMerged = fn;
      },
      {
        activity: { beginRequestActivity, renderRequestActivity },
        setStatusText: (message) => statusMessages.push(message),
      },
    );
    await act(async () => {
      await requestMoreMerged('owner/repo');
    });

    expect(beginRequestActivity).toHaveBeenCalledWith('dataLoad');
    expect(finishActivity).toHaveBeenCalledTimes(1);
    expect(renderRequestActivity).toHaveBeenCalled();
    expect(statusMessages).toContain('Loaded 2 merged PRs.');
    expect(window.beginRequestActivity).not.toHaveBeenCalled();
    expect(window.renderRequestActivity).not.toHaveBeenCalled();
  });

  test('given the server rejects the request, when called, then the failure snackbar fires and activity still finishes', async () => {
    const finishActivity = jest.fn();
    const showError = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: 'boom' }),
    });

    let requestMoreMerged;
    renderProbe(
      (fn) => {
        requestMoreMerged = fn;
      },
      {
        activity: { beginRequestActivity: () => finishActivity, renderRequestActivity: () => {} },
        showError,
      },
    );
    await act(async () => {
      await requestMoreMerged('owner/repo');
    });

    expect(showError).toHaveBeenCalledTimes(1);
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });
});
