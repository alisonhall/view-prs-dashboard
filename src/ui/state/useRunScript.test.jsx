/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useRunScript } = require('./useRunScript.jsx');
const { StatusTextContext } = require('./StatusTextContext');
const { FilterStateContext } = require('./FilterStateContext');
const { RowFilterSelectionContext } = require('./RowFilterSelectionContext');
const { SnackbarContext } = require('./SnackbarContext');
const { RequestActivityContext } = require('./RequestActivityContext');
const { OutputTextSetterContext } = require('./OutputTextContext');

function Probe({ onReady }) {
  const runScript = useRunScript();
  onReady(runScript);
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
// window.setStatusMessage - render Probe inside a real Provider value
// instead of mocking the old bridge.
//
// Phase H.20 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 6): useRunScript() now reads its form body via useFormBody()
// (FilterStateContext/RowFilterSelectionContext), not window.getFormBody -
// seed real Provider values instead of stubbing that bridge.
//
// Sixth follow-up (same audit): showErrorNotification now comes from
// useSnackbar() directly, not window.showErrorNotification - same real
// Provider value approach as statusText above.
const renderProbe = (
  onReady,
  { setStatusText = () => {}, values = {}, checkedByListId = {}, showError = () => {} } = {},
) =>
  render(
    <FilterStateContext.Provider value={{ values }}>
      <RowFilterSelectionContext.Provider value={{ checkedByListId }}>
        <StatusTextContext.Provider value={{ statusText: 'Not run', setStatusText }}>
          <SnackbarContext.Provider value={{ showError }}>
            <OutputTextSetterContext.Provider value={outputTextSetter}>
              <RequestActivityContext.Provider value={activity}>
                <Probe onReady={onReady} />
              </RequestActivityContext.Provider>
            </OutputTextSetterContext.Provider>
          </SnackbarContext.Provider>
        </StatusTextContext.Provider>
      </RowFilterSelectionContext.Provider>
    </FilterStateContext.Provider>,
  );

describe('useRunScript', () => {
  afterEach(() => {
    setOutputText = () => {};
    activity = makeActivity();
    delete window.applyFreshPrPayload;
    delete global.fetch;
  });

  test('given a single successful target, when running the script, then status/output messages track progress and the fresh payload is applied', async () => {
    const statusMessages = [];
    const outputMessages = [];
    const applyFreshPrPayload = jest.fn();
    const finishActivity = jest.fn();
    setOutputText = (message) => outputMessages.push(message);
    activity.beginRequestActivity = jest.fn(() => finishActivity);
    window.applyFreshPrPayload = applyFreshPrPayload;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, output: 'done', prData: { byPrNumber: { 7: {} } } }),
    });

    let runScript;
    renderProbe((fn) => { runScript = fn; }, {
      setStatusText: (message) => statusMessages.push(message),
      values: { repo: 'org/repo', prNumbersInput: '7' },
    });
    await act(async () => {
      await runScript();
    });

    expect(statusMessages).toEqual([
      'Running...',
      'Running PR #7 (1/1)...',
      'Completed',
    ]);
    expect(applyFreshPrPayload).toHaveBeenCalledWith({ byPrNumber: { 7: {} } }, 'org/repo');
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });

  test('given a non-numeric PR number input, when running the script, then it bails early with a validation message and never fetches', async () => {
    const statusMessages = [];
    global.fetch = jest.fn();

    let runScript;
    renderProbe((fn) => { runScript = fn; }, {
      setStatusText: (message) => statusMessages.push(message),
      values: { repo: 'org/repo', prNumbersInput: 'not-a-number' },
    });
    await act(async () => {
      await runScript();
    });

    expect(statusMessages).toEqual(['Run script requires numeric PR number(s) in "PR number(s)"']);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('given the fetch throws, when running the script, then failure messaging is shown and activity still finishes', async () => {
    const statusMessages = [];
    const snackbarCalls = [];
    const finishActivity = jest.fn();
    setOutputText = jest.fn();
    activity.beginRequestActivity = () => finishActivity;
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    let runScript;
    renderProbe((fn) => { runScript = fn; }, {
      setStatusText: (message) => statusMessages.push(message),
      values: { repo: 'org/repo', prNumbersInput: '' },
      showError: (...args) => snackbarCalls.push(args),
    });
    await act(async () => {
      await runScript();
    });

    expect(statusMessages).toEqual([
      'Running...',
      'Running All PRs (1/1)...',
      'Failed (network/error)',
    ]);
    expect(snackbarCalls).toHaveLength(1);
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });
});
