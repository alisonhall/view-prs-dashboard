/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
const { AutoRenderBlockingProvider } = require('./AutoRenderBlockingProvider');
const { useAutoRenderBlocking } = require('../state/AutoRenderBlockingContext');
const { StatusTextContext } = require('../state/StatusTextContext');

function Probe({ onValue }) {
  const value = useAutoRenderBlocking();
  onValue(value);
  return null;
}

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
  document.body.innerHTML = '<div id="auto-render-blocked-indicator" hidden></div>';
});

describe('AutoRenderBlockingProvider', () => {
  afterEach(() => {
    delete window.setPendingAutoRenderPayload;
    delete window.pushAutoRenderBlockingState;
    delete window.applyFreshPrPayload;
    delete window.renderRequestActivity;
  });

  test('given the provider mounts, when read, then it publishes its 2 remaining bridges and starts not blocked', () => {
    let latest;
    render(
      <AutoRenderBlockingProvider>
        <Probe onValue={(value) => (latest = value)} />
      </AutoRenderBlockingProvider>,
    );

    expect(typeof window.setPendingAutoRenderPayload).toBe('function');
    expect(typeof window.pushAutoRenderBlockingState).toBe('function');
    // The two getters were deleted (Phase 3): PrDataProvider reads them from
    // this Provider's Context now, so nothing publishes them on window.
    expect(window.getHasDirtyPrSectionsFields).toBeUndefined();
    expect(window.getPendingAutoRenderPayload).toBeUndefined();
    expect(latest.isBlocked).toBe(false);
  });

  test('given the Context functions, when blocking state and a pending payload are set, then they read back live and keep stable identities across renders', () => {
    let latest;
    const seenGetters = new Set();
    const seenSetters = new Set();
    render(
      <AutoRenderBlockingProvider>
        <Probe
          onValue={(value) => {
            latest = value;
            seenGetters.add(value.getHasDirtyPrSectionsFields);
            seenGetters.add(value.getPendingAutoRenderPayload);
            seenSetters.add(value.setPendingAutoRenderPayload);
          }}
        />
      </AutoRenderBlockingProvider>,
    );
    expect(latest.getHasDirtyPrSectionsFields()).toBe(false);
    expect(latest.getPendingAutoRenderPayload()).toBeNull();

    const payload = { byPrNumber: { 7: {} } };
    act(() => {
      window.pushAutoRenderBlockingState(DIRTY_STATE);
      latest.setPendingAutoRenderPayload(payload);
    });

    // Read through the *first* render's function instances, to prove they
    // read the Provider's ref (live), not a closure over stale state.
    const [firstHasDirty, firstGetPending] = [...seenGetters];
    expect(firstHasDirty()).toBe(true);
    expect(firstGetPending()).toBe(payload);
    expect(latest.isBlocked).toBe(true);
    // The Provider re-rendered at least once, yet each function is one stable
    // identity (so PrDataProvider can list them in useMemo deps without
    // rebuilding pollForDataChanges every render).
    expect(seenGetters.size).toBe(2);
    expect(seenSetters.size).toBe(1);

    act(() => {
      window.pushAutoRenderBlockingState(CLEAN_STATE);
    });
    expect(firstHasDirty()).toBe(false);
  });

  test('given a payload is pushed while dirty, when read, then isBlocked becomes true and the outer indicator panel unhides', () => {
    let latest;
    render(
      <AutoRenderBlockingProvider>
        <Probe onValue={(value) => (latest = value)} />
      </AutoRenderBlockingProvider>,
    );

    act(() => {
      window.pushAutoRenderBlockingState(DIRTY_STATE);
      window.setPendingAutoRenderPayload({ byPrNumber: {} });
    });

    expect(latest.isBlocked).toBe(true);
    expect(document.getElementById('auto-render-blocked-indicator')).not.toHaveAttribute('hidden');
    expect(latest.statusText).toContain('note section');
  });

  test('given no field is focused and nothing is dirty, when a payload is pushed, then it applies immediately via window.applyFreshPrPayload', async () => {
    const applyFreshPrPayload = jest.fn();
    window.applyFreshPrPayload = applyFreshPrPayload;
    const payload = { byPrNumber: { 1: {} } };
    let latest;
    render(
      <AutoRenderBlockingProvider>
        <Probe onValue={(value) => (latest = value)} />
      </AutoRenderBlockingProvider>,
    );

    act(() => {
      window.pushAutoRenderBlockingState(CLEAN_STATE);
      window.setPendingAutoRenderPayload(payload);
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(applyFreshPrPayload).toHaveBeenCalledWith(payload);
    expect(latest.isBlocked).toBe(false);
  });

  test('given a text field is focused, when a payload becomes eligible to apply, then it waits for blur before applying', async () => {
    const applyFreshPrPayload = jest.fn();
    window.applyFreshPrPayload = applyFreshPrPayload;
    const focusedInput = document.createElement('input');
    document.body.appendChild(focusedInput);
    focusedInput.focus();
    const payload = { byPrNumber: { 2: {} } };
    render(<AutoRenderBlockingProvider>{null}</AutoRenderBlockingProvider>);

    act(() => {
      window.pushAutoRenderBlockingState(CLEAN_STATE);
      window.setPendingAutoRenderPayload(payload);
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
    window.applyFreshPrPayload = applyFreshPrPayload;
    const payload = { byPrNumber: { 3: {} } };
    let latest;
    render(
      <StatusTextContext.Provider value={{ statusText: 'Not run', setStatusText }}>
        <AutoRenderBlockingProvider>
          <Probe onValue={(value) => (latest = value)} />
        </AutoRenderBlockingProvider>
      </StatusTextContext.Provider>,
    );

    act(() => {
      window.pushAutoRenderBlockingState(DIRTY_STATE);
      window.setPendingAutoRenderPayload(payload);
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
    window.applyFreshPrPayload = applyFreshPrPayload;
    let latest;
    render(
      <AutoRenderBlockingProvider>
        <Probe onValue={(value) => (latest = value)} />
      </AutoRenderBlockingProvider>,
    );

    act(() => {
      latest.discardAndApply();
    });

    expect(applyFreshPrPayload).not.toHaveBeenCalled();
  });

  test('given the provider unmounts, when unmounted, then both bridges are removed', () => {
    const { unmount } = render(<AutoRenderBlockingProvider>{null}</AutoRenderBlockingProvider>);

    expect(typeof window.setPendingAutoRenderPayload).toBe('function');
    unmount();
    expect(window.setPendingAutoRenderPayload).toBeUndefined();
    expect(window.pushAutoRenderBlockingState).toBeUndefined();
  });
});
