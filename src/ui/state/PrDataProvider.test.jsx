/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
const { PrDataProvider } = require('./PrDataProvider');
const { usePrData } = require('./PrDataContext');
const { BackfillStatusActionsContext } = require('./BackfillStatusContext');

// Window-bridge elimination Phase 4 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// pollBackfillStatus reads the tracking flags from BackfillStatusProvider's
// actions Context, not window.getBackfillTrackingState.
const renderWithBackfillTracking = (tracking, children) =>
  render(
    <BackfillStatusActionsContext.Provider value={{ getBackfillTrackingState: () => tracking }}>
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
    delete window.loadBackfillStatus;
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
    test('given a call to window.beginRequestActivity, when the returned finish function is called, then the badge bridge fires on begin and end, and the recent-activity bridge fires once on end', () => {
      const badgeCalls = [];
      const recentActivityCalls = [];
      window.updateReactRequestActivityBadges = (badges) => badgeCalls.push(badges);
      window.updateReactRecentRequestActivity = (entries) => recentActivityCalls.push(entries);

      render(
        <PrDataProvider>
          <div />
        </PrDataProvider>,
      );

      let finishActivity;
      act(() => {
        finishActivity = window.beginRequestActivity('runScript');
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
      expect(window.getLatestSchedulerState().isAutoRunInProgress).toBe(true);
    });

    test('given the backfill tracking state says a run is in progress, when pollBackfillStatus is called, then it calls the vanilla loadBackfillStatus bridge', async () => {
      const loadBackfillStatus = jest.fn().mockResolvedValue({});
      const tracking = { isBackfillRunning: true, isBackfillActionPending: false };
      window.loadBackfillStatus = loadBackfillStatus;

      let pollBackfillStatus;
      function Probe() {
        pollBackfillStatus = usePrData().pollBackfillStatus;
        return null;
      }
      renderWithBackfillTracking(tracking, <Probe />);

      await act(async () => {
        await pollBackfillStatus();
      });

      expect(loadBackfillStatus).toHaveBeenCalledWith({ announce: true, includeLog: true });
    });

    test('given the backfill tracking state says no run is in progress, when pollBackfillStatus is called, then it never calls loadBackfillStatus', async () => {
      const loadBackfillStatus = jest.fn();
      const tracking = { isBackfillRunning: false, isBackfillActionPending: false };
      window.loadBackfillStatus = loadBackfillStatus;

      let pollBackfillStatus;
      function Probe() {
        pollBackfillStatus = usePrData().pollBackfillStatus;
        return null;
      }
      renderWithBackfillTracking(tracking, <Probe />);

      await act(async () => {
        await pollBackfillStatus();
      });

      expect(loadBackfillStatus).not.toHaveBeenCalled();
    });

    test('given a backfill action is pending, when pollBackfillStatus is called, then it never calls loadBackfillStatus even though a run is in progress', async () => {
      const loadBackfillStatus = jest.fn();
      window.loadBackfillStatus = loadBackfillStatus;
      let pollBackfillStatus;
      function Probe() {
        pollBackfillStatus = usePrData().pollBackfillStatus;
        return null;
      }
      renderWithBackfillTracking({ isBackfillRunning: true, isBackfillActionPending: true }, <Probe />);

      await act(async () => {
        await pollBackfillStatus();
      });

      expect(loadBackfillStatus).not.toHaveBeenCalled();
    });

    test('given no BackfillStatusProvider at all, when pollBackfillStatus is called, then the inert default means it does nothing', async () => {
      const loadBackfillStatus = jest.fn();
      window.loadBackfillStatus = loadBackfillStatus;
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

      expect(loadBackfillStatus).not.toHaveBeenCalled();
    });
  });
});
