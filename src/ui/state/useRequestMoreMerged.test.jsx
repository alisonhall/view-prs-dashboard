/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useRequestMoreMerged } = require('./useRequestMoreMerged.jsx');
const { StatusTextContext } = require('./StatusTextContext');
const { SnackbarContext } = require('./SnackbarContext');
const { RequestActivityContext } = require('./RequestActivityContext');
const React = require('react');
const { PrDataProvider } = require('./PrDataProvider');
const { useRequestActivity } = require('./RequestActivityContext');

function Probe({ onReady }) {
  onReady(useRequestMoreMerged());
  return null;
}

// beginRequestActivity/renderRequestActivity come from usePrData() (Window-bridge
// elimination Phase 3, see WINDOW_BRIDGE_ELIMINATION_PLAN.md), so this renders
// the hook inside a real RequestActivityContext value and asserts on those functions
// instead of stubbing window.beginRequestActivity/renderRequestActivity.
const renderProbe = (onReady, { activity, setStatusText = () => {}, showError = () => {} }) =>
  render(
    <StatusTextContext.Provider value={{ statusText: '', setStatusText }}>
      <SnackbarContext.Provider value={{ showError }}>
        <RequestActivityContext.Provider value={activity}>
          <Probe onReady={onReady} />
        </RequestActivityContext.Provider>
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

  // Regression: these hooks are called from AppRoot's body. When they read
  // beginRequestActivity/renderRequestActivity through usePrData(), AppRoot
  // (and every portal it builds) re-rendered on each payload/repo/stats
  // update, since PrDataProvider's value changes on every one.
  test('given a component using the hook under a real PrDataProvider, when PR data is updated repeatedly, then it does not re-render', () => {
    let renders = 0;
    const AppRootLike = React.memo(function AppRootLike() {
      useRequestMoreMerged();
      renders += 1;
      return null;
    });
    render(
      <PrDataProvider initialPayload={{}} initialSelectedRepo="">
        <AppRootLike />
      </PrDataProvider>,
    );
    const baseline = renders;

    for (let i = 1; i <= 5; i += 1) {
      act(() => {
        window.updateReactPrTable({ byPrNumber: { [i]: { prNumber: String(i) } } }, 'owner/repo');
      });
    }

    expect(renders).toBe(baseline);
  });

  test('given a real PrDataProvider, when its request-activity functions are read twice across updates, then they are the same instances', () => {
    const seen = new Set();
    function Capture() {
      const { beginRequestActivity, renderRequestActivity } = useRequestActivity();
      seen.add(beginRequestActivity);
      seen.add(renderRequestActivity);
      return null;
    }
    render(
      <PrDataProvider initialPayload={{}} initialSelectedRepo="">
        <Capture />
      </PrDataProvider>,
    );
    act(() => {
      window.updateReactPrTable({ byPrNumber: { 1: { prNumber: '1' } } }, 'owner/repo');
    });

    expect(seen.size).toBe(2);
  });

  test('given no PrDataProvider at all, when the request-activity hook is used, then it is an inert default', () => {
    let activity;
    function Capture() {
      activity = useRequestActivity();
      return null;
    }
    render(<Capture />);

    expect(typeof activity.beginRequestActivity('x')).toBe('function');
    expect(() => activity.renderRequestActivity()).not.toThrow();
  });
});
