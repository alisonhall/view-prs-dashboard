/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useBackfillActions } = require('./useBackfillActions.jsx');
const { StatusTextContext } = require('./StatusTextContext');
const { SnackbarContext } = require('./SnackbarContext');
const { BackfillStatusContext } = require('./BackfillStatusContext');

function Probe({ onReady }) {
  const backfillActions = useBackfillActions();
  onReady(backfillActions);
  return null;
}

// Phase H.8 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// statusText now comes from StatusTextContext directly, not
// window.setStatusMessage - render Probe inside a real Provider value
// instead of mocking the old bridge.
//
// Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
// showErrorNotification now comes from useSnackbar() directly, not
// window.showErrorNotification - same real Provider value approach.
//
// Phase 1 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): the backfill tracking
// flags and their setters come from BackfillStatusContext directly, not
// window.getBackfillTrackingState/setSupportsBackfillLogPolling/
// setIsBackfillActionPending.
const renderProbe = (
  onReady,
  setStatusText = () => {},
  showError = () => {},
  backfillStatus = {},
) =>
  render(
    <StatusTextContext.Provider value={{ statusText: 'Not run', setStatusText }}>
      <SnackbarContext.Provider value={{ showError }}>
        <BackfillStatusContext.Provider
          value={{
            getBackfillTrackingState: () => ({
              supportsBackfillLogPolling: true,
              isBackfillRunning: false,
            }),
            setSupportsBackfillLogPolling: () => {},
            setIsBackfillActionPending: () => {},
            ...backfillStatus,
          }}
        >
          <Probe onReady={onReady} />
        </BackfillStatusContext.Provider>
      </SnackbarContext.Provider>
    </StatusTextContext.Provider>,
  );

const BACKFILL_WINDOW_BRIDGES = [
  'updateReactOutputText',
  'updateReactBackfillButtonState',
  'updateBackfillStatusFromPayload',
  'setBackfillLogMessage',
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
    const setIsBackfillActionPending = jest.fn();
    window.setBackfillLogMessage = jest.fn();
    window.beginRequestActivity = jest.fn(() => finishActivity);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, summary: 'Backfill started', running: true }),
    });

    let backfillActions;
    renderProbe((value) => { backfillActions = value; }, (message) => statusMessages.push(message), undefined, {
      setIsBackfillActionPending,
    });
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
    expect(setIsBackfillActionPending).toHaveBeenCalledWith(true);
    expect(setIsBackfillActionPending).toHaveBeenCalledWith(false);
    expect(updateBackfillStatusFromPayload).toHaveBeenCalled();
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });

  test('given loadBackfillStatus fails, when calling refreshBackfillStatus, then a synthetic failed status is rendered and a failure snackbar fires', async () => {
    const renderBackfillStatus = jest.fn();
    const snackbarCalls = [];
    const finishActivity = jest.fn();
    window.renderBackfillStatus = renderBackfillStatus;
    window.setBackfillLogMessage = jest.fn();
    window.beginRequestActivity = () => finishActivity;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: 'boom' }),
    });

    let backfillActions;
    renderProbe((value) => { backfillActions = value; }, undefined, (...args) => snackbarCalls.push(args));
    await act(async () => {
      await backfillActions.refreshBackfillStatus();
    });

    expect(renderBackfillStatus).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, running: false, error: 'boom' }),
    );
    expect(snackbarCalls).toHaveLength(1);
    expect(finishActivity).toHaveBeenCalledTimes(1);
  });

  test('given a successful request, when triggerBackfillTabLoad is called, then it loads status+log without announcing a status message or tracking request activity', async () => {
    const statusMessages = [];
    const updateBackfillStatusFromPayload = jest.fn();
    const beginRequestActivity = jest.fn();
    window.updateBackfillStatusFromPayload = updateBackfillStatusFromPayload;
    window.beginRequestActivity = beginRequestActivity;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, summary: 'Backfill idle', running: false }),
    });

    let backfillActions;
    renderProbe((value) => { backfillActions = value; }, (message) => statusMessages.push(message));
    await act(async () => {
      await backfillActions.triggerBackfillTabLoad();
    });

    expect(updateBackfillStatusFromPayload).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true }),
      { announce: false },
    );
    expect(statusMessages).toHaveLength(0);
    expect(beginRequestActivity).not.toHaveBeenCalled();
  });

  test('given the request fails, when triggerBackfillTabLoad is called, then a synthetic failed status is rendered and a failure snackbar fires', async () => {
    const renderBackfillStatus = jest.fn();
    const setBackfillLogMessage = jest.fn();
    const snackbarCalls = [];
    window.renderBackfillStatus = renderBackfillStatus;
    window.setBackfillLogMessage = setBackfillLogMessage;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ ok: false, error: 'boom' }),
    });

    let backfillActions;
    renderProbe((value) => { backfillActions = value; }, undefined, (...args) => snackbarCalls.push(args));
    await act(async () => {
      await backfillActions.triggerBackfillTabLoad();
    });

    expect(renderBackfillStatus).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, running: false, error: 'boom' }),
    );
    expect(setBackfillLogMessage).toHaveBeenCalledWith('Failed to load backfill log');
    expect(snackbarCalls).toHaveLength(1);
    expect(snackbarCalls[0][0]).toBe('Failed to load backfill status');
  });
});
