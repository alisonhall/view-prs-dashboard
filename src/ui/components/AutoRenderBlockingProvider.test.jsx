/** @jest-environment jsdom */

const { useEffect } = require('react');
const { render, act } = require('@testing-library/react');
const { AutoRenderBlockingProvider } = require('./AutoRenderBlockingProvider');
const {
  useAutoRenderBlocking,
  useAutoRenderBlockingActions,
} = require('../state/AutoRenderBlockingContext');
const { StatusTextContext } = require('../state/StatusTextContext');

function Probe({ onValue }) {
  const value = useAutoRenderBlocking();
  onValue(value);
  return null;
}

// Window-bridge elimination Phase 7 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// the Provider applies payloads through the function PrDataProvider (its
// descendant) registers, no longer window.applyFreshPrPayload - this stands
// in for PrDataProvider's registration.
function RegisterApplier({ applier }) {
  const { setFreshPayloadApplier } = useAutoRenderBlockingActions();
  useEffect(() => {
    setFreshPayloadApplier(applier);
    return () => setFreshPayloadApplier(null);
  }, [setFreshPayloadApplier, applier]);
  return null;
}

// Window-bridge elimination Phase 7.4: blocking state arrives through the
// actions Context (AutoRenderBlockingSync calls setBlockingState), no longer
// window.pushAutoRenderBlockingState. CaptureActions sits in each tree below.
let capturedActions;
function CaptureActions() {
  capturedActions = useAutoRenderBlockingActions();
  return null;
}
const pushBlockingState = (state) => capturedActions.setBlockingState(state);

const DIRTY_STATE = {
  dirtyFieldCount: 0,
  unsavedNotesCount: 1,
  blockingPrNumbers: ['42'],
  blockingAuthorInsightsLogins: [],
  blockingPrLabel: 'Blocking PRs: #42',
};

const CLEAN_STATE = {
  dirtyFieldCount: 0,
  unsavedNotesCount: 0,
  blockingPrNumbers: [],
  blockingAuthorInsightsLogins: [],
  blockingPrLabel: '',
};

// Build a real, un-focused, document-detached <input> for tests that
// don't care about the wait-for-blur branch - isTextEntryElement would
// otherwise treat document.body (jsdom's default activeElement) as a
// non-text element already, but being explicit keeps intent clear.
beforeEach(() => {
  document.body.innerHTML = '';
});

describe('AutoRenderBlockingProvider', () => {
  afterEach(() => {
    capturedActions = undefined;
  });

  test('given the provider mounts, when read, then it publishes no window bridges and starts not blocked', () => {
    let latest;
    render(
      <AutoRenderBlockingProvider>
        <CaptureActions />
        <Probe onValue={(value) => (latest = value)} />
      </AutoRenderBlockingProvider>,
    );

    // Test-only bridge removal: tests set the pending payload through the
    // actions Context (it was window.setPendingAutoRenderPayload).
    expect(window.setPendingAutoRenderPayload).toBeUndefined();
    // Phase 7.4: setBlockingState (actions Context) replaced this bridge.
    expect(window.pushAutoRenderBlockingState).toBeUndefined();
    // The two getters were deleted (Phase 3): PrDataProvider reads them from
    // this Provider's Context now, so nothing publishes them on window.
    expect(window.getHasDirtyPrSectionsFields).toBeUndefined();
    expect(window.getPendingAutoRenderPayload).toBeUndefined();
    expect(latest.isBlocked).toBe(false);
  });

  test('given the actions Context, when blocking state and a pending payload are set, then the functions read back live and keep stable identities across renders', () => {
    let latestState;
    let latestActions;
    const seenFunctions = new Set();
    function ActionsProbe() {
      const actions = useAutoRenderBlockingActions();
      latestActions = actions;
      seenFunctions.add(actions.getHasDirtyPrSectionsFields);
      seenFunctions.add(actions.getPendingAutoRenderPayload);
      seenFunctions.add(actions.setPendingAutoRenderPayload);
      seenFunctions.add(actions.setBlockingState);
      return null;
    }
    render(
      <AutoRenderBlockingProvider>
        <CaptureActions />
        <Probe onValue={(value) => (latestState = value)} />
        <ActionsProbe />
      </AutoRenderBlockingProvider>,
    );
    expect(latestActions.getHasDirtyPrSectionsFields()).toBe(false);
    expect(latestActions.getPendingAutoRenderPayload()).toBeNull();

    const payload = { byPrNumber: { 7: {} } };
    const first = latestActions;
    act(() => {
      pushBlockingState(DIRTY_STATE);
      latestActions.setPendingAutoRenderPayload(payload);
    });

    // Read through the *first* render's functions, to prove they read the
    // Provider's ref (live), not a closure over stale state.
    expect(first.getHasDirtyPrSectionsFields()).toBe(true);
    expect(first.getPendingAutoRenderPayload()).toBe(payload);
    expect(latestState.isBlocked).toBe(true);
    // The Provider re-rendered, yet the actions object and each function is
    // one stable identity (so PrDataProvider can list them in useMemo deps).
    expect(latestActions).toBe(first);
    expect(seenFunctions.size).toBe(4);

    act(() => {
      pushBlockingState(CLEAN_STATE);
    });
    expect(first.getHasDirtyPrSectionsFields()).toBe(false);
  });

  // Regression: PrDataProvider wraps the whole table tree. Blocking state is
  // pushed on every unsaved-edit change in it (index.page.js pushed it on every
  // input/change/click before Phase 7.4), so if PrDataProvider
  // (or anything between) subscribed to this Provider's changing state value,
  // each of those events re-rendered every usePrData() consumer - 20 extra
  // renders for 20 pushes when PrDataProvider read useAutoRenderBlocking().
  describe('blocking-state pushes under a real PrDataProvider', () => {
    const { PrDataProvider } = require('../state/PrDataProvider');
    const { usePrData } = require('../state/PrDataContext');
    const React = require('react');
    const makeState = (dirtyFieldCount) => ({ ...CLEAN_STATE, dirtyFieldCount });

    const renderWithConsumer = () => {
      let renders = 0;
      const Consumer = React.memo(function Consumer() {
        usePrData();
        renders += 1;
        return null;
      });
      render(
        <AutoRenderBlockingProvider>
          <CaptureActions />
          <PrDataProvider initialPayload={{}} initialSelectedRepo="">
            <Consumer />
          </PrDataProvider>
        </AutoRenderBlockingProvider>,
      );
      return () => renders;
    };

    test('given identical blocking state is pushed repeatedly, when a usePrData() consumer is mounted, then it does not re-render', () => {
      const getRenders = renderWithConsumer();
      const baseline = getRenders();

      for (let i = 0; i < 20; i += 1) {
        act(() => {
          pushBlockingState(makeState(0));
        });
      }

      expect(getRenders()).toBe(baseline);
    });

    test('given the blocking state genuinely changes (status text and isBlocked), when a usePrData() consumer is mounted, then it still does not re-render', () => {
      const getRenders = renderWithConsumer();
      const baseline = getRenders();

      act(() => {
        pushBlockingState(DIRTY_STATE);
        capturedActions.setPendingAutoRenderPayload({ byPrNumber: {} });
      });
      for (let count = 1; count <= 5; count += 1) {
        act(() => {
          pushBlockingState(makeState(count));
        });
      }

      expect(getRenders()).toBe(baseline);
    });
  });

  test('given a payload is pushed while dirty, when read, then isBlocked becomes true (the app header banner shows it)', () => {
    let latest;
    render(
      <AutoRenderBlockingProvider>
        <CaptureActions />
        <Probe onValue={(value) => (latest = value)} />
      </AutoRenderBlockingProvider>,
    );

    act(() => {
      pushBlockingState(DIRTY_STATE);
      capturedActions.setPendingAutoRenderPayload({ byPrNumber: {} });
    });

    expect(latest.isBlocked).toBe(true);
    expect(latest.statusText).toContain('note section');
  });

  test('given no field is focused and nothing is dirty, when a payload is pushed, then it applies immediately via the registered applier', async () => {
    const applyFreshPrPayload = jest.fn();
    const payload = { byPrNumber: { 1: {} } };
    let latest;
    render(
      <AutoRenderBlockingProvider>
        <CaptureActions />
        <RegisterApplier applier={applyFreshPrPayload} />
        <Probe onValue={(value) => (latest = value)} />
      </AutoRenderBlockingProvider>,
    );

    act(() => {
      pushBlockingState(CLEAN_STATE);
      capturedActions.setPendingAutoRenderPayload(payload);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(applyFreshPrPayload).toHaveBeenCalledWith(payload);
    expect(latest.isBlocked).toBe(false);
  });

  test('given a text field is focused, when a payload becomes eligible to apply, then it waits for blur before applying', async () => {
    const applyFreshPrPayload = jest.fn();
    const focusedInput = document.createElement('input');
    document.body.appendChild(focusedInput);
    focusedInput.focus();
    const payload = { byPrNumber: { 2: {} } };
    render(
      <AutoRenderBlockingProvider>
        <CaptureActions />
        <RegisterApplier applier={applyFreshPrPayload} />
      </AutoRenderBlockingProvider>,
    );

    act(() => {
      pushBlockingState(CLEAN_STATE);
      capturedActions.setPendingAutoRenderPayload(payload);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(applyFreshPrPayload).not.toHaveBeenCalled();

    act(() => {
      focusedInput.blur();
    });

    expect(applyFreshPrPayload).toHaveBeenCalledWith(payload);
  });

  test('given a pending payload, when discardAndApply is called, then it clears the payload, applies it, and sets a status message', () => {
    const applyFreshPrPayload = jest.fn();
    const setStatusText = jest.fn();
    const payload = { byPrNumber: { 3: {} } };
    let latest;
    render(
      <StatusTextContext.Provider value={{ statusText: 'Not run', setStatusText }}>
        <AutoRenderBlockingProvider>
          <CaptureActions />
          <RegisterApplier applier={applyFreshPrPayload} />
          <Probe onValue={(value) => (latest = value)} />
        </AutoRenderBlockingProvider>
      </StatusTextContext.Provider>,
    );

    act(() => {
      pushBlockingState(DIRTY_STATE);
      capturedActions.setPendingAutoRenderPayload(payload);
    });
    expect(latest.isBlocked).toBe(true);

    act(() => {
      latest.discardAndApply();
    });

    expect(applyFreshPrPayload).toHaveBeenCalledWith(payload);
    expect(setStatusText).toHaveBeenCalledWith(
      'Applied latest updates and discarded unsaved edits.',
    );
    expect(latest.isBlocked).toBe(false);
  });

  test('given no pending payload, when discardAndApply is called, then nothing happens', () => {
    const applyFreshPrPayload = jest.fn();
    let latest;
    render(
      <AutoRenderBlockingProvider>
        <CaptureActions />
        <RegisterApplier applier={applyFreshPrPayload} />
        <Probe onValue={(value) => (latest = value)} />
      </AutoRenderBlockingProvider>,
    );

    act(() => {
      latest.discardAndApply();
    });

    expect(applyFreshPrPayload).not.toHaveBeenCalled();
  });

  test('given blocking state is set through the actions Context, when read, then the display Context exposes the blocking PRs, authors and label for the chips', () => {
    let latest;
    render(
      <AutoRenderBlockingProvider>
        <CaptureActions />
        <Probe onValue={(value) => (latest = value)} />
      </AutoRenderBlockingProvider>,
    );
    expect(latest.blockingPrNumbers).toEqual([]);
    expect(latest.blockingAuthorInsightsLogins).toEqual([]);

    act(() => {
      pushBlockingState({ ...DIRTY_STATE, blockingAuthorInsightsLogins: ['octocat'] });
    });

    expect(latest.blockingPrNumbers).toEqual(['42']);
    expect(latest.blockingAuthorInsightsLogins).toEqual(['octocat']);
    expect(latest.blockingPrLabel).toBe('Blocking PRs: #42');
  });
});
