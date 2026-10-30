/** @jest-environment jsdom */

const { memo } = require('react');
const { render, act } = require('@testing-library/react');
const { PrDataProvider } = require('./PrDataProvider');
const { usePrData } = require('./PrDataContext');
const { createPrDataProbe } = require('../test-fixtures/pr-data-probe');
const prDataProbe = createPrDataProbe();
const { usePrDataActions } = require('./PrDataActionsContext');
const { BackfillStatusActionsContext } = require('./BackfillStatusContext');
const { AutoRenderBlockingActionsContext } = require('./AutoRenderBlockingContext');
const { StatusTextContext } = require('./StatusTextContext');
const { SnackbarContext } = require('./SnackbarContext');

// Window-bridge elimination Phase 4 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// pollBackfillStatus reads the tracking flags from BackfillStatusProvider's
// actions Context, not window.getBackfillTrackingState - and since Phase 7.2
// the load too, not window.loadBackfillStatus.
const renderWithBackfillTracking = (tracking, children, loadBackfillStatus = async () => null) =>
  render(
    <BackfillStatusActionsContext.Provider value={{ getBackfillTrackingState: () => tracking, loadBackfillStatus }}>
      <PrDataProvider>{children}</PrDataProvider>
    </BackfillStatusActionsContext.Provider>,
  );

// Regression (lesson 1 in WINDOW_BRIDGE_ELIMINATION_PLAN.md): PrDataProvider
// reads useStatusText() and useSnackbar(), whose values change on every status
// message and notification, so it re-renders on each one. Its Context value
// was rebuilt on every render, which re-rendered every usePrData() consumer -
// the whole PR table - each time. It's memoized now; a memo consumer must only
// re-render when PR data itself changes.
describe('PrDataProvider Context value identity', () => {
  const { StatusTextProvider } = require('../components/StatusTextProvider');
  const { SnackbarProvider } = require('../components/SnackbarProvider');
  const { useStatusText } = require('./StatusTextContext');
  const { useSnackbar } = require('./SnackbarContext');

  test('given status-text and snackbar updates, when the provider re-renders for them, then a memo usePrData() consumer does not re-render, but a real data change still reaches it', () => {
    document.body.innerHTML = '<div id="status"></div>';
    let renders = 0;
    let latestPayload;
    const Consumer = memo(function Consumer() {
      latestPayload = usePrData().payload;
      renders += 1;
      return null;
    });
    let controls;
    function Controls() {
      controls = { status: useStatusText(), snackbar: useSnackbar() };
      return null;
    }
    const probe = createPrDataProbe();
    render(
      <StatusTextProvider>
        <SnackbarProvider>
          <Controls />
          <PrDataProvider initialPayload={{ byPrNumber: {} }} initialSelectedRepo="owner/repo">
            <probe.PrDataProbe />
            <Consumer />
          </PrDataProvider>
        </SnackbarProvider>
      </StatusTextProvider>,
    );
    const baseline = renders;

    for (let i = 0; i < 5; i += 1) {
      act(() => controls.status.setStatusText(`status ${i}`));
    }
    act(() => controls.snackbar.showError('title', 'detail', 0));
    act(() => controls.snackbar.hide());

    expect(renders).toBe(baseline);

    // Guard against a vacuous pass: a real PR-data change does reach it.
    const nextPayload = { byPrNumber: { 1: {} } };
    act(() => probe.applyFreshTablePayload(nextPayload));
    expect(renders).toBe(baseline + 1);
    expect(latestPayload).toBe(nextPayload);
  });
});

describe('PrDataProvider', () => {
  afterEach(() => {
    prDataProbe.reset();
    delete window.updateReactStatsViewState;
    delete window.getLatestSchedulerState;
  });

  // Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): these
  // used to test window.updateReactPrTable/getReactPrTableSelectedRepo/
  // updateReactSelectedAuthorLogin, bridges with no production caller. The
  // same behaviour is tested through the Context those bridges wrapped.
  // window.getReactPrTablePayload went in the third group, once e2e made real
  // held-back polls instead of reading the payload to fake one.
  test('given an initial payload and selectedRepo, when rendering, then usePrData() exposes both', () => {
    const payload = { byPrNumber: { 1: {} } };
    render(
      <PrDataProvider initialPayload={payload} initialSelectedRepo="owner/repo">
        <prDataProbe.PrDataProbe />
      </PrDataProvider>,
    );

    expect(prDataProbe.readPayload()).toBe(payload);
    expect(prDataProbe.readSelectedRepo()).toBe('owner/repo');
  });

  test('given the provider mounts, when window is checked, then the removed test-only bridges are not published', () => {
    render(
      <PrDataProvider initialPayload={{}}>
        <div />
      </PrDataProvider>,
    );

    expect(window.updateReactPrTable).toBeUndefined();
    expect(window.getReactPrTableSelectedRepo).toBeUndefined();
    expect(window.updateReactSelectedAuthorLogin).toBeUndefined();
    expect(window.getReactPrTablePayload).toBeUndefined();
  });

  // Phase H.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // PrTableApp.tsx's own per-row Ack/Apply-Label handlers call this
  // directly via Context. (It had the same merge semantics as the deleted
  // window.updateReactPrTable.)
  describe('applyFreshTablePayload', () => {
    const renderWith = (payload, repo) =>
      render(
        <PrDataProvider initialPayload={payload} initialSelectedRepo={repo}>
          <prDataProbe.PrDataProbe />
        </PrDataProvider>,
      );

    test('given a new payload and selectedRepo, when called, then both update together', () => {
      renderWith({ byPrNumber: { 1: {} } }, 'owner/repo-a');

      const payloadB = { byPrNumber: { 1: {}, 2: {} } };
      act(() => {
        prDataProbe.applyFreshTablePayload(payloadB, 'owner/repo-b');
      });

      expect(prDataProbe.readPayload()).toBe(payloadB);
      expect(prDataProbe.readSelectedRepo()).toBe('owner/repo-b');
    });

    test('given newPayload is undefined, when called, then the previous payload is kept', () => {
      const payloadA = { byPrNumber: { 1: {} } };
      renderWith(payloadA, 'owner/repo-a');

      act(() => {
        prDataProbe.applyFreshTablePayload(undefined, 'owner/repo-b');
      });

      expect(prDataProbe.readPayload()).toBe(payloadA);
      expect(prDataProbe.readSelectedRepo()).toBe('owner/repo-b');
    });

    test('given newSelectedRepo is falsy, when called, then the previous selectedRepo is kept', () => {
      renderWith({ byPrNumber: { 1: {} } }, 'owner/repo-a');

      const payloadB = { byPrNumber: { 1: {}, 2: {} } };
      act(() => {
        prDataProbe.applyFreshTablePayload(payloadB, '');
      });

      expect(prDataProbe.readPayload()).toBe(payloadB);
      expect(prDataProbe.readSelectedRepo()).toBe('owner/repo-a');
    });
  });

  test('given setSelectedAuthorLogin, when called with a login and then with nothing, then a consumer sees the author update and then clear', () => {
    let selected;
    function Read() {
      selected = usePrData().selectedAuthorLogin;
      return null;
    }
    render(
      <PrDataProvider initialPayload={{}} initialSelectedAuthorLogin="octocat">
        <prDataProbe.PrDataProbe />
        <Read />
      </PrDataProvider>,
    );
    expect(selected).toBe('octocat');

    act(() => {
      prDataProbe.setSelectedAuthorLogin('hubot');
    });
    expect(selected).toBe('hubot');

    act(() => {
      prDataProbe.setSelectedAuthorLogin(undefined);
    });
    expect(selected).toBe('');
  });


  // Phase F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // beginRequestActivity/renderRequestActivity/pollBackfillStatus moved
  // here from index.page.js (pollSchedulerStatus did too, but was deleted
  // outright in Phase H.2 - see REACT_MIGRATION_PLAN.md - once its own
  // automatic interval had already been retired in favor of SSE and
  // index.html.test.js's one direct call was its only remaining caller).
  describe('backfill poll', () => {
    // Window-bridge elimination Phase 7.3: the beginRequestActivity/badge and
    // scheduler-state tests moved to components/RequestActivityProvider.test.jsx
    // with the code; only the backfill poll is still this Provider's.
    test('given the backfill tracking state says a run is in progress, when pollBackfillStatus is called, then it calls the BackfillStatusProvider loadBackfillStatus', async () => {
      const loadBackfillStatus = jest.fn().mockResolvedValue({});
      const tracking = { isBackfillRunning: true, isBackfillActionPending: false };

      let pollBackfillStatus;
      function Probe() {
        pollBackfillStatus = usePrData().pollBackfillStatus;
        return null;
      }
      renderWithBackfillTracking(tracking, <Probe />, loadBackfillStatus);

      await act(async () => {
        await pollBackfillStatus();
      });

      expect(loadBackfillStatus).toHaveBeenCalledWith({ announce: true, includeLog: true });
    });

    test('given the backfill tracking state says no run is in progress, when pollBackfillStatus is called, then it never calls loadBackfillStatus', async () => {
      const loadBackfillStatus = jest.fn();
      const tracking = { isBackfillRunning: false, isBackfillActionPending: false };

      let pollBackfillStatus;
      function Probe() {
        pollBackfillStatus = usePrData().pollBackfillStatus;
        return null;
      }
      renderWithBackfillTracking(tracking, <Probe />, loadBackfillStatus);

      await act(async () => {
        await pollBackfillStatus();
      });

      expect(loadBackfillStatus).not.toHaveBeenCalled();
    });

    test('given a backfill action is pending, when pollBackfillStatus is called, then it never calls loadBackfillStatus even though a run is in progress', async () => {
      const loadBackfillStatus = jest.fn();
      let pollBackfillStatus;
      function Probe() {
        pollBackfillStatus = usePrData().pollBackfillStatus;
        return null;
      }
      renderWithBackfillTracking({ isBackfillRunning: true, isBackfillActionPending: true }, <Probe />, loadBackfillStatus);

      await act(async () => {
        await pollBackfillStatus();
      });

      expect(loadBackfillStatus).not.toHaveBeenCalled();
    });

    test('given no BackfillStatusProvider at all, when pollBackfillStatus is called, then the inert default means it does nothing', async () => {
      global.fetch = jest.fn();
      let pollBackfillStatus;
      function Probe() {
        pollBackfillStatus = usePrData().pollBackfillStatus;
        return null;
      }
      render(
        <PrDataProvider>
          <Probe />
        </PrDataProvider>,
      );

      await act(async () => {
        await pollBackfillStatus();
      });

      expect(global.fetch).not.toHaveBeenCalled();
      delete global.fetch;
    });
  });

  // Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
  // the data pipeline (loadStoredData/renderPrData/applyFreshPrPayload/...)
  // moved here from index.page.js.
  describe('data pipeline', () => {
    const PAYLOAD = {
      ok: true,
      byPrNumber: { 7: { prNumber: '7' } },
      lastRun: { repo: 'owner/repo', updatedAt: '2026-10-21T10:00:00Z' },
      dataMeta: { dataVersion: 'v1' },
    };

    afterEach(() => {
      delete global.fetch;
    });

    let latest;
    let actions;
    function Probe() {
      latest = usePrData();
      actions = usePrDataActions();
      return null;
    }

    const renderWithContexts = ({
      loadOnMount = false,
      setStatusText = () => {},
      showError = () => {},
      autoRenderActions = {},
      backfillActions = {},
      children = <Probe />,
    } = {}) =>
      render(
        <StatusTextContext.Provider value={{ statusText: '', setStatusText }}>
          <SnackbarContext.Provider value={{ showError, showWarning: () => {}, hide: () => {} }}>
            <BackfillStatusActionsContext.Provider
              value={{
                getBackfillTrackingState: () => ({ isBackfillRunning: false, isBackfillActionPending: false }),
                updateBackfillStatusFromPayload: () => {},
                ...backfillActions,
              }}
            >
              <AutoRenderBlockingActionsContext.Provider
                value={{
                  getHasDirtyPrSectionsFields: () => false,
                  getPendingAutoRenderPayload: () => null,
                  setPendingAutoRenderPayload: () => {},
                  setFreshPayloadApplier: () => {},
                  ...autoRenderActions,
                }}
              >
                <PrDataProvider loadOnMount={loadOnMount}>{children}</PrDataProvider>
              </AutoRenderBlockingActionsContext.Provider>
            </BackfillStatusActionsContext.Provider>
          </SnackbarContext.Provider>
        </StatusTextContext.Provider>,
      );

    test('given loadOnMount, when mounted, then it fetches /view-prs/data once and renders that payload with its resolved repo', async () => {
      const updateBackfillStatusFromPayload = jest.fn();
      global.fetch = jest.fn(async () => ({ ok: true, json: async () => PAYLOAD }));

      renderWithContexts({ loadOnMount: true, backfillActions: { updateBackfillStatusFromPayload } });
      expect(latest.hasRenderedPrData).toBe(false);
      await act(async () => {});

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith('/view-prs/data');
      expect(latest.payload).toEqual(PAYLOAD);
      expect(latest.selectedRepo).toBe('owner/repo');
      expect(latest.hasRenderedPrData).toBe(true);
      expect(actions.getLatestStoredPayload()).toEqual(PAYLOAD);
      expect(updateBackfillStatusFromPayload).toHaveBeenCalledWith(PAYLOAD);
    });

    test('given no loadOnMount, when mounted, then it never fetches', async () => {
      global.fetch = jest.fn();

      renderWithContexts();
      await act(async () => {});

      expect(global.fetch).not.toHaveBeenCalled();
      expect(latest.hasRenderedPrData).toBe(false);
    });

    test('given the initial fetch fails, when mounted with loadOnMount, then it sets the failure status and shows an error snackbar, without rendering', async () => {
      const setStatusText = jest.fn();
      const showError = jest.fn();
      global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({ ok: false, error: 'boom' }) }));

      renderWithContexts({ loadOnMount: true, setStatusText, showError });
      await act(async () => {});

      expect(setStatusText).toHaveBeenCalledWith('Failed to load stored data');
      expect(showError).toHaveBeenCalledTimes(1);
      expect(showError.mock.calls[0][0]).toBe('Failed to load stored data');
      expect(latest.hasRenderedPrData).toBe(false);
    });

    test('given applyFreshPrPayload, when called, then it displays the payload, clears the pending auto-render payload, and pushes its backfill status', () => {
      const setPendingAutoRenderPayload = jest.fn();
      const updateBackfillStatusFromPayload = jest.fn();
      renderWithContexts({
        autoRenderActions: { setPendingAutoRenderPayload },
        backfillActions: { updateBackfillStatusFromPayload },
      });

      act(() => {
        actions.applyFreshPrPayload(PAYLOAD, 'other/repo');
      });

      expect(latest.payload).toBe(PAYLOAD);
      expect(latest.selectedRepo).toBe('other/repo');
      expect(latest.hasRenderedPrData).toBe(true);
      expect(actions.getLatestStoredPayload()).toBe(PAYLOAD);
      expect(setPendingAutoRenderPayload).toHaveBeenCalledWith(null);
      expect(updateBackfillStatusFromPayload).toHaveBeenCalledWith(PAYLOAD);
    });

    test('given applyLatestPrData, when called, then the newest stored payload changes but the displayed one does not', () => {
      renderWithContexts();
      const displayedBefore = latest.payload;

      act(() => {
        actions.applyLatestPrData({ payload: PAYLOAD });
      });

      expect(actions.getLatestStoredPayload()).toBe(PAYLOAD);
      expect(latest.payload).toBe(displayedBefore);
    });

    test('given the auto-render-blocking Provider above it, when mounted and unmounted, then it registers its applyFreshPrPayload and then clears it', () => {
      const setFreshPayloadApplier = jest.fn();
      const { unmount } = renderWithContexts({ autoRenderActions: { setFreshPayloadApplier } });

      expect(setFreshPayloadApplier).toHaveBeenLastCalledWith(actions.applyFreshPrPayload);
      unmount();
      expect(setFreshPayloadApplier).toHaveBeenLastCalledWith(null);
    });

    // Lessons 1-2 of the plan: hooks high in the tree (AppShell's parts) read
    // these actions, so an identity change on every payload update would
    // re-render them and
    // (via useBackfillAutoRefresh-style effects) can start request loops.
    test('given repeated payload updates, when the actions are read, then their identity never changes and a memoized consumer of them does not re-render', () => {
      let renders = 0;
      let firstActions;
      const ActionsConsumer = memo(function ActionsConsumer() {
        const consumed = usePrDataActions();
        renders += 1;
        firstActions = firstActions || consumed;
        return null;
      });
      renderWithContexts({
        children: (
          <>
            <Probe />
            <ActionsConsumer />
          </>
        ),
      });
      const rendersAfterMount = renders;

      act(() => {
        actions.applyFreshPrPayload(PAYLOAD, 'owner/repo');
      });
      act(() => {
        actions.applyFreshPrPayload({ ...PAYLOAD, byPrNumber: {} }, 'owner/repo');
      });

      expect(actions).toBe(firstActions);
      expect(renders).toBe(rendersAfterMount);
    });
  });
});
