/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useBackfillActions } = require('./useBackfillActions.jsx');
const { StatusTextContext } = require('./StatusTextContext');

function Probe({ onReady }) {
  const backfillActions = useBackfillActions();
  onReady(backfillActions);
  return null;
}

// Phase H.8 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// statusText now comes from StatusTextContext directly, not
// window.setStatusMessage - render Probe inside a real Provider value
// instead of mocking the old bridge.
const renderProbe = (onReady, setStatusText = () => {}) =>
  render(
    <StatusTextContext.Provider value={{ statusText: 'Not run', setStatusText }}>
      <Probe onReady={onReady} />
    </StatusTextContext.Provider>,
  );

const BACKFILL_WINDOW_BRIDGES = [
  'updateReactOutputText',
  'updateReactBackfillButtonState',
  'showErrorNotification',
  'updateBackfillStatusFromPayload',
  'setBackfillLogMessage',
  'getBackfillTrackingState',
  'setSupportsBackfillLogPolling',
  'setIsBackfillActionPending',
  'renderBackfillStatus',
  'beginRequestActivity',
];

describe('useBackfillActions', () => {
  afterEach(() => {
    BACKFILL_WINDOW_BRIDGES.forEach((name) => delete window[name]);
    delete global.fetch;
  });

  test('given a successful start action, when calling handleBackfillAction, then the button state is disabled then refreshed, and status reflects the result', async () => {
    const buttonStates = [];
    const statusMessages = [];
    const updateBackfillStatusFromPayload = jest.fn();
    const finishActivity = jest.fn();
    window.updateReactBackfillButtonState = (state) => buttonStates.push(state);
    window.updateReactOutputText = jest.fn();
    window.updateBackfillStatusFromPayload = updateBackfillStatusFromPayload;
    window.getBackfillTrackingState = () => ({
      supportsBackfillLogPolling: true,
      isBackfillRunning: false,
      isBackfillActionPending: false,
    });
    window.setSupportsBackfillLogPolling = jest.fn();
    window.setIsBackfillActionPending = jest.fn();
    window.setBackfillLogMessage = jest.fn();
    window.beginRequestActivity = jest.fn(() => finishActivity);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, summary: 'Backfill started', running: true }),
    });

    let backfillActions;
    renderProbe((value) => { backfillActions = value; }, (message) => statusMessages.push(message));
    await act(async () => {
      await backfillActions.handleBackfillAction('start');
    });

    expect(buttonStates[0]).toEqual({
      startDisabled: true,
      stopDisabled: true,
      refreshDisabled: true,
      refreshLogDisabled: true,
    });
    expect(statusMessages).toContain('Starting backfill...');
    expect(statusMessages).toContain('Backfill started');
    expect(window.setIsBackfillActionPending).toHaveBeenCalledWith(true);
    expect(window.setIsBackfillActionPending).toHaveBeenCalledWith(false);
    expect(updateBackfillStatusFromPayload).toHaveBeenCalled();
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });

  test('given loadBackfillStatus fails, when calling refreshBackfillStatus, then a synthetic failed status is rendered and a failure snackbar fires', async () => {
    const renderBackfillStatus = jest.fn();
    const snackbarCalls = [];
    const finishActivity = jest.fn();
    window.renderBackfillStatus = renderBackfillStatus;
    window.setBackfillLogMessage = jest.fn();
    window.showErrorNotification = (...args) => snackbarCalls.push(args);
    window.beginRequestActivity = () => finishActivity;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: 'boom' }),
    });

    let backfillActions;
    renderProbe((value) => { backfillActions = value; });
    await act(async () => {
      await backfillActions.refreshBackfillStatus();
    });

    expect(renderBackfillStatus).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, running: false, error: 'boom' }),
    );
    expect(snackbarCalls).toHaveLength(1);
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });
});
