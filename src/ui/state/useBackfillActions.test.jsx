/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useBackfillActions } = require('./useBackfillActions.tsx');
const { StatusTextContext } = require('./StatusTextContext');
const { SnackbarContext } = require('./SnackbarContext');
const { RequestActivityContext } = require('./RequestActivityContext');
const { OutputTextSetterContext } = require('./OutputTextContext');
const { BackfillStatusActionsContext } = require('./BackfillStatusContext');

function Probe({ onReady }) {
  const backfillActions = useBackfillActions();
  onReady(backfillActions);
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
// Sixth follow-up (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit"):
// showErrorNotification now comes from useSnackbar() directly, not
// window.showErrorNotification - same real Provider value approach.
//
// Phase 1/3d/4 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): the backfill tracking
// flags, their setters and the status functions come from
// BackfillStatusActionsContext directly, not window.getBackfillTrackingState/
// setSupportsBackfillLogPolling/setIsBackfillActionPending/
// updateBackfillStatusFromPayload/renderBackfillStatus/setBackfillLogMessage.
// Tests set per-test mocks on `actionsOverrides` (reset after each test).
let actionsOverrides = {};
const renderProbe = (
  onReady,
  setStatusText = () => {},
  showError = () => {},
  backfillStatus = {},
) =>
  render(
    <StatusTextContext.Provider value={{ statusText: 'Not run', setStatusText }}>
      <SnackbarContext.Provider value={{ showError }}>
        <BackfillStatusActionsContext.Provider
          value={{
            getBackfillTrackingState: () => ({
              supportsBackfillLogPolling: true,
              isBackfillRunning: false,
              isBackfillActionPending: false,
            }),
            setSupportsBackfillLogPolling: () => {},
            setIsBackfillActionPending: () => {},
            setBackfillButtonState: () => {},
            updateBackfillStatusFromPayload: () => {},
            renderBackfillStatus: () => {},
            setBackfillLogMessage: () => {},
            ...actionsOverrides,
            ...backfillStatus,
          }}
        >
          <OutputTextSetterContext.Provider value={outputTextSetter}>
            <RequestActivityContext.Provider value={activity}>
              <Probe onReady={onReady} />
            </RequestActivityContext.Provider>
          </OutputTextSetterContext.Provider>
        </BackfillStatusActionsContext.Provider>
      </SnackbarContext.Provider>
    </StatusTextContext.Provider>,
  );


describe('useBackfillActions', () => {
  afterEach(() => {
    actionsOverrides = {};
    activity = makeActivity();
    setOutputText = () => {};
    delete global.fetch;
  });

  test('given a successful start action, when calling handleBackfillAction, then the button state is disabled then refreshed, and status reflects the result', async () => {
    const buttonStates = [];
    const statusMessages = [];
    const updateBackfillStatusFromPayload = jest.fn();
    const finishActivity = jest.fn();
    setOutputText = jest.fn();
    actionsOverrides.updateBackfillStatusFromPayload = updateBackfillStatusFromPayload;
    const setIsBackfillActionPending = jest.fn();
    actionsOverrides.setBackfillLogMessage = jest.fn();
    activity.beginRequestActivity = jest.fn(() => finishActivity);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, summary: 'Backfill started', running: true }),
    });

    let backfillActions;
    renderProbe((value) => { backfillActions = value; }, (message) => statusMessages.push(message), undefined, {
      setIsBackfillActionPending,
      // Window-bridge elimination Phase 3d: the button state is written through
      // BackfillStatusContext now, not window.updateReactBackfillButtonState.
      setBackfillButtonState: (state) => buttonStates.push(state),
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
    actionsOverrides.renderBackfillStatus = renderBackfillStatus;
    actionsOverrides.setBackfillLogMessage = jest.fn();
    activity.beginRequestActivity = () => finishActivity;
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
    actionsOverrides.updateBackfillStatusFromPayload = updateBackfillStatusFromPayload;
    activity.beginRequestActivity = beginRequestActivity;
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
    actionsOverrides.renderBackfillStatus = renderBackfillStatus;
    actionsOverrides.setBackfillLogMessage = setBackfillLogMessage;
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

  // Regression guard. useBackfillAutoRefresh lists `triggerBackfillTabLoad`
  // as an effect dependency and fires a status+log fetch whenever it changes
  // while the Backfill section is showing, and each fetch updates state that
  // re-renders the caller - so if this hook's return value ever gets a new
  // identity on re-render (one unstable dependency anywhere in the provider
  // chain is enough), that becomes a fetch loop. It's stable today only
  // because every dependency is; this pins it, under the *real* providers
  // and every kind of update that can re-render the caller in production.
  describe('result identity under the real providers', () => {
    const { StatusTextProvider } = require('../components/StatusTextProvider');
    const { SnackbarProvider } = require('../components/SnackbarProvider');
    const { OutputTextProvider } = require('../components/OutputTextProvider');
    const { BackfillStatusProvider } = require('../components/BackfillStatusProvider');
    const { PrDataProvider } = require('./PrDataProvider');
    // Test-only bridge removal: a sibling probe pushes the PR-data update
    // (it was window.updateReactPrTable), so Caller's own subscriptions stay
    // exactly what the hook under test needs.
    const { createPrDataProbe } = require('../test-fixtures/pr-data-probe');
    const prDataProbe = createPrDataProbe();
    const { useStatusText } = require('./StatusTextContext');
    const { useSnackbar } = require('./SnackbarContext');
    const { useOutputText } = require('./OutputTextContext');
    const { useBackfillStatusActions } = require('./BackfillStatusContext');

    test('given status, output, backfill, snackbar and PR-data updates, when the caller re-renders, then the hook returns the very same object and functions every time', () => {
      document.body.innerHTML = '<div id="status"></div>';
      const seenResults = new Set();
      const seenTriggers = new Set();
      let renders = 0;
      let controls;
      function Caller() {
        const result = useBackfillActions();
        seenResults.add(result);
        seenTriggers.add(result.triggerBackfillTabLoad);
        renders += 1;
        controls = {
          status: useStatusText(),
          snackbar: useSnackbar(),
          output: useOutputText(),
          backfill: useBackfillStatusActions(),
        };
        return null;
      }
      render(
        <StatusTextProvider>
          <SnackbarProvider>
            <OutputTextProvider>
              <BackfillStatusProvider>
                <PrDataProvider initialPayload={{}} initialSelectedRepo="">
                  <prDataProbe.PrDataProbe />
                  <Caller />
                </PrDataProvider>
              </BackfillStatusProvider>
            </OutputTextProvider>
          </SnackbarProvider>
        </StatusTextProvider>,
      );
      const rendersBefore = renders;

      act(() => controls.status.setStatusText('status'));
      act(() => controls.output.setOutputText('output'));
      act(() => controls.backfill.setBackfillLogMessage('log'));
      act(() => controls.backfill.renderBackfillStatus({ running: true }));
      act(() => controls.backfill.setIsBackfillActionPending(true));
      act(() => controls.snackbar.showError('title', 'detail', 0));
      act(() => {
        prDataProbe.applyFreshTablePayload({ byPrNumber: { 1: { prNumber: '1' } } }, 'owner/repo');
      });

      // Guard against a vacuous pass: the caller really did re-render.
      expect(renders).toBeGreaterThan(rendersBefore);
      expect(seenResults.size).toBe(1);
      expect(seenTriggers.size).toBe(1);
    });
  });
});
