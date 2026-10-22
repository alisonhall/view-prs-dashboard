/** @jest-environment jsdom */

const { memo } = require('react');
const { render, act } = require('@testing-library/react');
const { PrDataProvider } = require('./PrDataProvider');
const { usePrData } = require('./PrDataContext');
const { usePrDataActions } = require('./PrDataActionsContext');
const { useRequestActivity } = require('./RequestActivityContext');
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

describe('PrDataProvider', () => {
  afterEach(() => {
    delete window.updateReactPrTable;
    delete window.getReactPrTablePayload;
    delete window.getReactPrTableSelectedRepo;
    delete window.updateReactSelectedAuthorLogin;
    delete window.updateReactStatsViewState;
    delete window.beginRequestActivity;
    delete window.renderRequestActivity;
    delete window.setLatestSchedulerStateAndRender;
    delete window.getLatestSchedulerState;
    delete window.updateReactRequestActivityBadges;
    delete window.updateReactRecentRequestActivity;
  });

  test('given an initial payload, when rendering, then window.getReactPrTablePayload returns it', () => {
    const payload = { byPrNumber: { 1: {} } };
    render(
      <PrDataProvider initialPayload={payload}>
        <div />
      </PrDataProvider>,
    );

    expect(window.getReactPrTablePayload()).toBe(payload);
  });

  // Deferred-items follow-up, item 6 (see REACT_MIGRATION_PLAN.md): this
  // read bridge exists specifically so a handful of index.page.js DI
  // wirings can read the same payload the visible React table is showing,
  // instead of a second, independently-timed vanilla copy - it must always
  // return the LATEST payload, not whatever was current when the bridge was
  // first assigned (a stale closure here would defeat the entire point).
  test('given window.updateReactPrTable pushes a new payload, when getReactPrTablePayload is called again, then it returns the new payload, not a stale one', () => {
    const payloadA = { byPrNumber: { 1: {} } };
    render(
      <PrDataProvider initialPayload={payloadA}>
        <div />
      </PrDataProvider>,
    );
    expect(window.getReactPrTablePayload()).toBe(payloadA);

    const payloadB = { byPrNumber: { 1: {}, 2: {} } };
    act(() => {
      window.updateReactPrTable(payloadB);
    });

    expect(window.getReactPrTablePayload()).toBe(payloadB);
  });

  test('given the provider unmounts, when getReactPrTablePayload is checked, then the bridge is removed', () => {
    const { unmount } = render(
      <PrDataProvider initialPayload={{}}>
        <div />
      </PrDataProvider>,
    );
    expect(typeof window.getReactPrTablePayload).toBe('function');

    unmount();

    expect(window.getReactPrTablePayload).toBeUndefined();
  });

  // Sub-phase 7.2 follow-up (see REACT_MIGRATION_PLAN.md): a dedicated
  // read bridge for selectedRepo alone, mirroring getReactPrTablePayload's
  // own tests above.
  test('given an initial selectedRepo, when rendering, then window.getReactPrTableSelectedRepo returns it', () => {
    render(
      <PrDataProvider initialSelectedRepo="owner/repo">
        <div />
      </PrDataProvider>,
    );

    expect(window.getReactPrTableSelectedRepo()).toBe('owner/repo');
  });

  test('given window.updateReactPrTable pushes a new selectedRepo, when getReactPrTableSelectedRepo is called again, then it returns the new value, not a stale one', () => {
    render(
      <PrDataProvider initialSelectedRepo="owner/repo-a">
        <div />
      </PrDataProvider>,
    );
    expect(window.getReactPrTableSelectedRepo()).toBe('owner/repo-a');

    act(() => {
      window.updateReactPrTable(undefined, 'owner/repo-b');
    });

    expect(window.getReactPrTableSelectedRepo()).toBe('owner/repo-b');
  });

  test('given the provider unmounts, when getReactPrTableSelectedRepo is checked, then the bridge is removed', () => {
    const { unmount } = render(
      <PrDataProvider initialSelectedRepo="owner/repo">
        <div />
      </PrDataProvider>,
    );
    expect(typeof window.getReactPrTableSelectedRepo).toBe('function');

    unmount();

    expect(window.getReactPrTableSelectedRepo).toBeUndefined();
  });

  // Phase H.5 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // same merge semantics window.updateReactPrTable already has (above) -
  // PrTableApp.jsx's own per-row Ack/Apply-Label handlers call this
  // directly via Context instead of the window bridge.
  describe('applyFreshTablePayload', () => {
    let applyFreshTablePayload;
    function Probe() {
      applyFreshTablePayload = usePrData().applyFreshTablePayload;
      return null;
    }

    test('given a new payload and selectedRepo, when called, then both update together', () => {
      const payloadA = { byPrNumber: { 1: {} } };
      render(
        <PrDataProvider initialPayload={payloadA} initialSelectedRepo="owner/repo-a">
          <Probe />
        </PrDataProvider>,
      );

      const payloadB = { byPrNumber: { 1: {}, 2: {} } };
      act(() => {
        applyFreshTablePayload(payloadB, 'owner/repo-b');
      });

      expect(window.getReactPrTablePayload()).toBe(payloadB);
      expect(window.getReactPrTableSelectedRepo()).toBe('owner/repo-b');
    });

    test('given newPayload is undefined, when called, then the previous payload is kept', () => {
      const payloadA = { byPrNumber: { 1: {} } };
      render(
        <PrDataProvider initialPayload={payloadA} initialSelectedRepo="owner/repo-a">
          <Probe />
        </PrDataProvider>,
      );

      act(() => {
        applyFreshTablePayload(undefined, 'owner/repo-b');
      });

      expect(window.getReactPrTablePayload()).toBe(payloadA);
      expect(window.getReactPrTableSelectedRepo()).toBe('owner/repo-b');
    });

    test('given newSelectedRepo is falsy, when called, then the previous selectedRepo is kept', () => {
      const payloadA = { byPrNumber: { 1: {} } };
      render(
        <PrDataProvider initialPayload={payloadA} initialSelectedRepo="owner/repo-a">
          <Probe />
        </PrDataProvider>,
      );

      const payloadB = { byPrNumber: { 1: {}, 2: {} } };
      act(() => {
        applyFreshTablePayload(payloadB, '');
      });

      expect(window.getReactPrTablePayload()).toBe(payloadB);
      expect(window.getReactPrTableSelectedRepo()).toBe('owner/repo-a');
    });
  });

  // Phase F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
  // beginRequestActivity/renderRequestActivity/pollBackfillStatus moved
  // here from index.page.js (pollSchedulerStatus did too, but was deleted
  // outright in Phase H.2 - see REACT_MIGRATION_PLAN.md - once its own
  // automatic interval had already been retired in favor of SSE and
  // index.html.test.js's one direct call was its only remaining caller).
  describe('request activity', () => {
    test('given a call to beginRequestActivity from the Context, when the returned finish function is called, then the badge bridge fires on begin and end, and the recent-activity bridge fires once on end', () => {
      const badgeCalls = [];
      const recentActivityCalls = [];
      window.updateReactRequestActivityBadges = (badges) => badgeCalls.push(badges);
      window.updateReactRecentRequestActivity = (entries) => recentActivityCalls.push(entries);

      // Window-bridge elimination Phase 7.2: window.beginRequestActivity is
      // gone; this reads the same function from RequestActivityContext.
      let beginRequestActivity;
      function Probe() {
        ({ beginRequestActivity } = useRequestActivity());
        return null;
      }
      render(
        <PrDataProvider>
          <Probe />
        </PrDataProvider>,
      );

      let finishActivity;
      act(() => {
        finishActivity = beginRequestActivity('runScript');
      });
      expect(badgeCalls).toHaveLength(1);
      expect(recentActivityCalls).toHaveLength(0);

      act(() => {
        finishActivity();
      });
      expect(badgeCalls).toHaveLength(2);
      expect(recentActivityCalls).toHaveLength(1);
      expect(recentActivityCalls[0][0]).toEqual(
        expect.objectContaining({ key: 'runScript', label: 'Run script' }),
      );

      // Calling the same finish function again is a no-op (same guard
      // beginRequestActivity always had) - no extra badge/history pushes.
      act(() => {
        finishActivity();
      });
      expect(badgeCalls).toHaveLength(2);
      expect(recentActivityCalls).toHaveLength(1);
    });

    test('given window.setLatestSchedulerStateAndRender pushes an in-progress auto-run, when renderRequestActivity next fires, then the badge view model reflects it', () => {
      const badgeCalls = [];
      window.updateReactRequestActivityBadges = (badges) => badgeCalls.push(badges);

      render(
        <PrDataProvider>
          <div />
        </PrDataProvider>,
      );

      act(() => {
        window.setLatestSchedulerStateAndRender({
          isAutoRunInProgress: true,
          lastAutoAttemptAt: new Date().toISOString(),
        });
      });

      expect(badgeCalls).toHaveLength(1);
      // window.getLatestSchedulerState is gone (Phase 7.2); assert the badge itself.
      expect(badgeCalls[0].some((badge) => String(badge.text).startsWith('Auto run'))).toBe(true);
    });

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

    // Lessons 1-2 of the plan: hooks in AppRoot's body read these actions, so
    // an identity change on every payload update would re-render AppRoot and
    // (via useBackfillTabAutoRefresh-style effects) can start request loops.
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
