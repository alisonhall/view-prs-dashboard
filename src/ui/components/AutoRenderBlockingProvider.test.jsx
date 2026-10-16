/** @jest-environment jsdom */

const { render, act } = require('@testing-library/react');
const { AutoRenderBlockingProvider } = require('./AutoRenderBlockingProvider');
const { useAutoRenderBlocking } = require('../state/AutoRenderBlockingContext');

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
    delete window.getHasDirtyPrSectionsFields;
    delete window.getPendingAutoRenderPayload;
    delete window.applyFreshPrPayload;
    delete window.setStatusMessage;
  });

  test('given the provider mounts, when read, then it publishes all 4 bridges and starts not blocked', () => {
    let latest;
    render(
      <AutoRenderBlockingProvider>
        <Probe onValue={(value) => (latest = value)} />
      </AutoRenderBlockingProvider>,
    );

    expect(typeof window.setPendingAutoRenderPayload).toBe('function');
    expect(typeof window.pushAutoRenderBlockingState).toBe('function');
    expect(typeof window.getHasDirtyPrSectionsFields).toBe('function');
    expect(typeof window.getPendingAutoRenderPayload).toBe('function');
    expect(latest.isBlocked).toBe(false);
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
    const setStatusMessage = jest.fn();
    window.applyFreshPrPayload = applyFreshPrPayload;
    window.setStatusMessage = setStatusMessage;
    const payload = { byPrNumber: { 3: {} } };
    let latest;
    render(
      <AutoRenderBlockingProvider>
        <Probe onValue={(value) => (latest = value)} />
      </AutoRenderBlockingProvider>,
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
    expect(setStatusMessage).toHaveBeenCalledWith(
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

  test('given the provider unmounts, when unmounted, then all 4 bridges are removed', () => {
    const { unmount } = render(<AutoRenderBlockingProvider>{null}</AutoRenderBlockingProvider>);

    expect(typeof window.setPendingAutoRenderPayload).toBe('function');
    unmount();
    expect(window.setPendingAutoRenderPayload).toBeUndefined();
    expect(window.pushAutoRenderBlockingState).toBeUndefined();
    expect(window.getHasDirtyPrSectionsFields).toBeUndefined();
    expect(window.getPendingAutoRenderPayload).toBeUndefined();
  });
});
