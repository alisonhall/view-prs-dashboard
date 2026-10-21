/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useSinglePrUpdate } = require('./useSinglePrUpdate.jsx');
const { StatusTextContext } = require('./StatusTextContext');
const { SnackbarContext } = require('./SnackbarContext');
const { RequestActivityContext } = require('./RequestActivityContext');
const { OutputTextSetterContext } = require('./OutputTextContext');

function Probe({ onReady }) {
  const runSinglePrUpdate = useSinglePrUpdate();
  onReady(runSinglePrUpdate);
  return null;
}

// Window-bridge elimination Phase 3c (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// the output text setter comes from OutputTextContext now, not
// window.updateReactOutputText - tests assign `setOutputText` (reset after
// each test) instead of stubbing the bridge.
let setOutputText = () => {};
const outputTextSetter = (message) => setOutputText(message);

// Window-bridge elimination Phase 3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// beginRequestActivity/renderRequestActivity come from usePrData() now, not
// window.beginRequestActivity/renderRequestActivity - tests set these on
// `activity` (reset after each test) instead of stubbing the bridges.
const makeActivity = () => ({ beginRequestActivity: () => () => {}, renderRequestActivity: () => {} });
let activity = makeActivity();

// Phase H.8 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// statusText now comes from StatusTextContext directly, not
// window.updateReactStatusText - render Probe inside a real Provider value
// instead of mocking the old bridge.
//
// Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
// showErrorNotification now comes from useSnackbar() directly, not
// window.showErrorNotification - same real Provider value approach.
const renderProbe = (onReady, setStatusText = () => {}, showError = () => {}) =>
  render(
    <StatusTextContext.Provider value={{ statusText: 'Not run', setStatusText }}>
      <SnackbarContext.Provider value={{ showError }}>
        <OutputTextSetterContext.Provider value={outputTextSetter}>
<RequestActivityContext.Provider value={activity}>
          <Probe onReady={onReady} />
        </RequestActivityContext.Provider>
</OutputTextSetterContext.Provider>
      </SnackbarContext.Provider>
    </StatusTextContext.Provider>,
  );

describe('useSinglePrUpdate', () => {
  afterEach(() => {
    setOutputText = () => {};
    activity = makeActivity();
    delete window.applyFreshPrPayload;
    delete global.fetch;
  });

  test('given a successful update with a fresh payload, when running the update, then status/output messages are set in order and the fresh payload is applied directly, with no redundant reload', async () => {
    const statusMessages = [];
    const outputMessages = [];
    const applyFreshPrPayload = jest.fn();
    const finishActivity = jest.fn();
    const beginRequestActivity = jest.fn(() => finishActivity);
    setOutputText = (message) => outputMessages.push(message);
    activity.beginRequestActivity = beginRequestActivity;
    window.applyFreshPrPayload = applyFreshPrPayload;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        output: 'ansi-output',
        prData: { byPrNumber: { 7: {} } },
      }),
    });

    let runSinglePrUpdate;
    renderProbe((fn) => { runSinglePrUpdate = fn; }, (message) => statusMessages.push(message));

    await act(async () => {
      await runSinglePrUpdate({ repo: 'org/repo', prNumber: 7 }, { number: 7 });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/view-prs/run',
      expect.objectContaining({
        body: JSON.stringify({ repo: 'org/repo', prNumber: '7', openMode: 'none', quiet: true }),
      }),
    );
    expect(statusMessages).toEqual(['Updating PR #7...', 'PR #7 updated']);
    expect(outputMessages).toEqual(['', 'ansi-output']);
    expect(beginRequestActivity).toHaveBeenCalledWith('singlePr');
    // Regression coverage for the old double-fetch/double-render this hook
    // replaces: exactly one direct payload application, no second fetch.
    expect(applyFreshPrPayload).toHaveBeenCalledTimes(1);
    expect(applyFreshPrPayload).toHaveBeenCalledWith({ byPrNumber: { 7: {} } }, 'org/repo');
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });

  test('given a failed update with a GitHub auth hint, when running the update, then auth-aware failure messaging and a snackbar notification are shown', async () => {
    const statusMessages = [];
    const outputMessages = [];
    const snackbarCalls = [];
    setOutputText = (message) => outputMessages.push(message);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        ok: false,
        error: 'GitHub CLI authentication required: run gh auth login or sign in',
      }),
    });

    let runSinglePrUpdate;
    renderProbe(
      (fn) => { runSinglePrUpdate = fn; },
      (message) => statusMessages.push(message),
      (...args) => snackbarCalls.push(args),
    );

    await act(async () => {
      await runSinglePrUpdate({}, { number: 11 });
    });

    expect(statusMessages).toEqual([
      'Updating PR #11...',
      'Failed to update PR #11',
      'Failed to update PR #11 (GitHub auth required)',
    ]);
    expect(snackbarCalls).toHaveLength(1);
    expect(snackbarCalls[0][0]).toBe('Update failed for PR #11');
  });

  test('given a thrown error during the update, when running the update, then failure messaging and a snackbar notification are shown, and activity still finishes', async () => {
    const statusMessages = [];
    const outputMessages = [];
    const snackbarCalls = [];
    const finishActivity = jest.fn();
    setOutputText = (message) => outputMessages.push(message);
    activity.beginRequestActivity = () => finishActivity;
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    let runSinglePrUpdate;
    renderProbe(
      (fn) => { runSinglePrUpdate = fn; },
      (message) => statusMessages.push(message),
      (...args) => snackbarCalls.push(args),
    );

    await act(async () => {
      await runSinglePrUpdate({}, { number: 19 });
    });

    expect(statusMessages).toEqual(['Updating PR #19...', 'Failed to update PR #19']);
    expect(outputMessages).toEqual(['', 'Error: network down']);
    expect(snackbarCalls).toHaveLength(1);
    expect(snackbarCalls[0][0]).toBe('Update failed for PR #19');
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });
});
