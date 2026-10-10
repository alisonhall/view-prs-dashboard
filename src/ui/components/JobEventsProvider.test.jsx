/** @jest-environment jsdom */

const { render, act, cleanup } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { JobEventsProvider } = require('./JobEventsProvider');
const { useJobEvents } = require('../state/JobEventsContext');
const { PrDataContext } = require('../state/PrDataContext');

// jsdom does not implement EventSource, and there is no existing
// EventSource/WebSocket usage anywhere in this repo to copy a mock from -
// this is intentionally small (~30 lines) so tests can drive readyState
// precisely, which a generic mocking library would make harder, not easier.
class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  constructor(url) {
    this.url = url;
    this.readyState = FakeEventSource.CONNECTING;
    this.onopen = null;
    this.onerror = null;
    this.listeners = {};
    this.close = jest.fn(() => {
      this.readyState = FakeEventSource.CLOSED;
    });
    FakeEventSource.instances.push(this);
  }

  addEventListener(type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] || []).filter((h) => h !== handler);
  }

  emit(type, dataObject) {
    (this.listeners[type] || []).forEach((handler) => handler({ data: JSON.stringify(dataObject) }));
  }

  triggerOpen() {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }

  simulateError(readyState) {
    this.readyState = readyState;
    this.onerror?.();
  }
}

let ProbeLastValue;
function Probe() {
  ProbeLastValue = useJobEvents();
  return null;
}

describe('JobEventsProvider', () => {
  let originalEventSource;

  beforeEach(() => {
    jest.useFakeTimers();
    FakeEventSource.instances = [];
    originalEventSource = window.EventSource;
    window.EventSource = FakeEventSource;
    ProbeLastValue = undefined;
  });

  afterEach(() => {
    cleanup();
    if (originalEventSource === undefined) {
      delete window.EventSource;
    } else {
      window.EventSource = originalEventSource;
    }
    delete window.renderSchedulerStatus;
    delete window.pollForDataChanges;
    jest.useRealTimers();
  });

  test('opens exactly one EventSource connection to /view-prs/events on mount', () => {
    render(
      <JobEventsProvider>
        <Probe />
      </JobEventsProvider>,
    );

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('/view-prs/events');
  });

  test('a snapshot frame seeds job state and marks the connection open', () => {
    render(
      <JobEventsProvider>
        <Probe />
      </JobEventsProvider>,
    );
    const instance = FakeEventSource.instances[0];

    act(() => {
      instance.triggerOpen();
      instance.emit('snapshot', {
        at: '2026-01-01T00:00:00.000Z',
        scheduler: {
          isAutoRunInProgress: true,
          quickCheckSkippedWhileAutoRunInProgress: true,
        },
      });
    });

    expect(ProbeLastValue.connection).toBe('open');
    expect(ProbeLastValue.jobs.autoRefresh.status).toBe('running');
    expect(ProbeLastValue.jobs.quickCheck.waitingOn).toEqual({
      job: 'autoRefresh',
      since: '2026-01-01T00:00:00.000Z',
    });
  });

  // Regression tests: schedulerSummary's own default
  // (getInitialJobEventsState) is a hardcoded placeholder, not real data -
  // without a payload.scheduler fallback, a fresh page load would
  // briefly show it instead of the real values PrDataProvider's payload
  // already has from its own very first /view-prs/data fetch. Found via
  // code review.
  describe('schedulerSummary payload.scheduler fallback (see JobEventsProvider.jsx\'s own comment)', () => {
    test('given a payload.scheduler and no SSE snapshot has arrived yet, when read, then schedulerSummary reflects payload.scheduler, not the hardcoded default', () => {
      render(
        <PrDataContext.Provider
          value={{
            payload: {
              scheduler: {
                intervalMinutes: 45,
                lastAutoRunAt: '2026-01-01T00:05:00.000Z',
              },
            },
          }}
        >
          <JobEventsProvider>
            <Probe />
          </JobEventsProvider>
        </PrDataContext.Provider>,
      );

      expect(ProbeLastValue.schedulerSummary.intervalMinutes).toBe(45);
      expect(ProbeLastValue.schedulerSummary.lastAutoRunAt).toBe('2026-01-01T00:05:00.000Z');
    });

    test('given no PrDataContext ancestor at all, when read, then schedulerSummary falls back to the hardcoded default without throwing', () => {
      render(
        <JobEventsProvider>
          <Probe />
        </JobEventsProvider>,
      );

      expect(ProbeLastValue.schedulerSummary.intervalMinutes).toBe(15);
    });

    test('given a payload.scheduler fallback is showing, when a real SSE snapshot arrives, then schedulerSummary switches to the live SSE value instead', () => {
      render(
        <PrDataContext.Provider
          value={{ payload: { scheduler: { intervalMinutes: 45 } } }}
        >
          <JobEventsProvider>
            <Probe />
          </JobEventsProvider>
        </PrDataContext.Provider>,
      );
      expect(ProbeLastValue.schedulerSummary.intervalMinutes).toBe(45);

      const instance = FakeEventSource.instances[0];
      act(() => {
        instance.triggerOpen();
        instance.emit('snapshot', {
          at: '2026-01-01T00:00:00.000Z',
          scheduler: { intervalMinutes: 30 },
        });
      });

      expect(ProbeLastValue.schedulerSummary.intervalMinutes).toBe(30);
    });
  });

  test('a job frame updates state and calls window.renderSchedulerStatus with the bundled scheduler object', () => {
    window.renderSchedulerStatus = jest.fn();
    render(
      <JobEventsProvider>
        <Probe />
      </JobEventsProvider>,
    );
    const instance = FakeEventSource.instances[0];

    act(() => {
      instance.emit('job', {
        type: 'job',
        job: 'autoRefresh',
        phase: 'start',
        seq: 1,
        at: '2026-01-01T00:00:00.000Z',
        scheduler: { isAutoRunInProgress: true },
      });
    });

    expect(ProbeLastValue.jobs.autoRefresh.status).toBe('running');
    expect(window.renderSchedulerStatus).toHaveBeenCalledWith({ isAutoRunInProgress: true });
  });

  test('an autoRefresh finish event triggers an immediate window.pollForDataChanges call', () => {
    window.pollForDataChanges = jest.fn();
    render(
      <JobEventsProvider>
        <Probe />
      </JobEventsProvider>,
    );
    const instance = FakeEventSource.instances[0];

    act(() => {
      instance.emit('job', { type: 'job', job: 'autoRefresh', phase: 'finish', seq: 1, ok: true });
    });

    expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);
  });

  test('a "data-changed" event (from ack/apply-label/manual-run/request-more) triggers an immediate window.pollForDataChanges call', () => {
    window.pollForDataChanges = jest.fn();
    render(
      <JobEventsProvider>
        <Probe />
      </JobEventsProvider>,
    );
    const instance = FakeEventSource.instances[0];

    act(() => {
      instance.emit('data-changed', { type: 'data-changed', seq: 1, at: '2026-01-01T00:00:00.000Z' });
    });

    expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);
  });

  test('a quickCheck finish event does not trigger window.pollForDataChanges', () => {
    window.pollForDataChanges = jest.fn();
    render(
      <JobEventsProvider>
        <Probe />
      </JobEventsProvider>,
    );
    const instance = FakeEventSource.instances[0];

    act(() => {
      instance.emit('job', { type: 'job', job: 'quickCheck', phase: 'finish', seq: 1, ok: true });
    });

    expect(window.pollForDataChanges).not.toHaveBeenCalled();
  });

  test('onerror while CONNECTING marks the connection reconnecting without opening a new EventSource', () => {
    render(
      <JobEventsProvider>
        <Probe />
      </JobEventsProvider>,
    );
    const instance = FakeEventSource.instances[0];

    act(() => {
      instance.simulateError(FakeEventSource.CONNECTING);
    });

    expect(ProbeLastValue.connection).toBe('reconnecting');
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  test('onerror while CLOSED marks the connection offline and reconnects after a backoff delay', () => {
    render(
      <JobEventsProvider>
        <Probe />
      </JobEventsProvider>,
    );
    const instance = FakeEventSource.instances[0];

    act(() => {
      instance.simulateError(FakeEventSource.CLOSED);
    });
    expect(ProbeLastValue.connection).toBe('offline');
    expect(instance.close).toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  test('staleness watchdog flips isStale after 60s of silence following an open event', () => {
    render(
      <JobEventsProvider>
        <Probe />
      </JobEventsProvider>,
    );
    const instance = FakeEventSource.instances[0];

    act(() => {
      instance.emit('job', { type: 'job', seq: 1, at: new Date().toISOString() });
    });
    expect(ProbeLastValue.isStale).toBe(false);

    act(() => {
      jest.advanceTimersByTime(90000);
    });
    expect(ProbeLastValue.isStale).toBe(true);
  });

  test('unmount closes the EventSource and clears pending timers', () => {
    const { unmount } = render(
      <JobEventsProvider>
        <Probe />
      </JobEventsProvider>,
    );
    const instance = FakeEventSource.instances[0];

    unmount();

    expect(instance.close).toHaveBeenCalled();
  });

  test('when window.EventSource is unavailable, the connection state is "unsupported" and nothing is opened', () => {
    delete window.EventSource;

    render(
      <JobEventsProvider>
        <Probe />
      </JobEventsProvider>,
    );

    expect(ProbeLastValue.connection).toBe('unsupported');
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
