/** @jest-environment jsdom */

const { render, act, cleanup } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { JobEventsProvider } = require('./JobEventsProvider');
const { useJobEvents } = require('../state/JobEventsContext');
const { PrDataContext } = require('../state/PrDataContext');
const { RequestActivityContext } = require('../state/RequestActivityContext');

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

  // Window-bridge elimination Phase 7.3: renderSchedulerStatus comes from
  // RequestActivityProvider's Context now, not window.renderSchedulerStatus.
  test('a job frame updates state and calls renderSchedulerStatus with the bundled scheduler object', () => {
    const renderSchedulerStatus = jest.fn();
    render(
      <RequestActivityContext.Provider value={{ renderSchedulerStatus }}>
        <JobEventsProvider>
          <Probe />
        </JobEventsProvider>
      </RequestActivityContext.Provider>,
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
    expect(renderSchedulerStatus).toHaveBeenCalledWith({ isAutoRunInProgress: true });
  });

  test('an autoRefresh finish event triggers an immediate pollForDataChanges call', () => {
    const pollForDataChanges = jest.fn();
    render(
      <PrDataContext.Provider value={{ pollForDataChanges }}>
        <JobEventsProvider>
          <Probe />
        </JobEventsProvider>
      </PrDataContext.Provider>,
    );
    const instance = FakeEventSource.instances[0];

    act(() => {
      instance.emit('job', { type: 'job', job: 'autoRefresh', phase: 'finish', seq: 1, ok: true });
    });

    expect(pollForDataChanges).toHaveBeenCalledTimes(1);
  });

  test('a "data-changed" event (from ack/apply-label/manual-run/request-more) triggers an immediate pollForDataChanges call', () => {
    const pollForDataChanges = jest.fn();
    render(
      <PrDataContext.Provider value={{ pollForDataChanges }}>
        <JobEventsProvider>
          <Probe />
        </JobEventsProvider>
      </PrDataContext.Provider>,
    );
    const instance = FakeEventSource.instances[0];

    act(() => {
      instance.emit('data-changed', { type: 'data-changed', seq: 1, at: '2026-01-01T00:00:00.000Z' });
    });

    expect(pollForDataChanges).toHaveBeenCalledTimes(1);
  });

  // A quick check writes its repo's live summary and queues changed PRs,
  // both of which the rows show.
  test('a quickCheck finish event triggers pollForDataChanges', () => {
    const pollForDataChanges = jest.fn();
    render(
      <PrDataContext.Provider value={{ pollForDataChanges }}>
        <JobEventsProvider>
          <Probe />
        </JobEventsProvider>
      </PrDataContext.Provider>,
    );
    const instance = FakeEventSource.instances[0];

    act(() => {
      instance.emit('job', { type: 'job', job: 'quickCheck', phase: 'finish', seq: 1, ok: true });
    });

    expect(pollForDataChanges).toHaveBeenCalledTimes(1);
  });

  test('runs one data poll at a time: requests while one runs make one more after it', async () => {
    let finishPoll;
    const pollForDataChanges = jest.fn(
      () =>
        new Promise((resolve) => {
          finishPoll = resolve;
        }),
    );
    render(
      <PrDataContext.Provider value={{ pollForDataChanges }}>
        <JobEventsProvider>
          <Probe />
        </JobEventsProvider>
      </PrDataContext.Provider>,
    );
    const instance = FakeEventSource.instances[0];

    act(() => {
      instance.emit('data-changed', { type: 'data-changed', seq: 1 });
      instance.emit('data-changed', { type: 'data-changed', seq: 2 });
      instance.emit('data-changed', { type: 'data-changed', seq: 3 });
    });
    expect(pollForDataChanges).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishPoll();
    });
    expect(pollForDataChanges).toHaveBeenCalledTimes(2);

    await act(async () => {
      finishPoll();
    });
    expect(pollForDataChanges).toHaveBeenCalledTimes(2);
  });

  test('polls on every snapshot once the data has loaded: changes before a connection opens are not pushed', async () => {
    const pollForDataChanges = jest.fn();
    render(
      <PrDataContext.Provider value={{ pollForDataChanges, payload: { ok: true } }}>
        <JobEventsProvider>
          <Probe />
        </JobEventsProvider>
      </PrDataContext.Provider>,
    );
    const instance = FakeEventSource.instances[0];

    await act(async () => {
      instance.emit('snapshot', { scheduler: {}, at: '2026-01-01T00:00:00.000Z' });
    });
    expect(pollForDataChanges).toHaveBeenCalledTimes(1);

    await act(async () => {
      instance.emit('snapshot', { scheduler: {}, at: '2026-01-01T00:01:00.000Z' });
    });
    expect(pollForDataChanges).toHaveBeenCalledTimes(2);
  });

  test("a snapshot before the page's first data load polls once that load finishes, not before", () => {
    const pollForDataChanges = jest.fn();
    const tree = (payload) => (
      <PrDataContext.Provider value={{ pollForDataChanges, payload }}>
        <JobEventsProvider>
          <Probe />
        </JobEventsProvider>
      </PrDataContext.Provider>
    );
    const { rerender } = render(tree(null));
    const instance = FakeEventSource.instances[0];

    act(() => {
      instance.emit('snapshot', { scheduler: {}, at: '2026-01-01T00:00:00.000Z' });
    });
    expect(pollForDataChanges).not.toHaveBeenCalled();

    rerender(tree({ ok: true }));
    expect(pollForDataChanges).toHaveBeenCalledTimes(1);

    // Only once: a later payload doesn't poll again.
    rerender(tree({ ok: true, lastRun: {} }));
    expect(pollForDataChanges).toHaveBeenCalledTimes(1);
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

  // The server's heartbeat is a named event (an SSE comment never reaches
  // the page): a quiet server isn't a stale connection.
  test('heartbeats keep it from going stale while nothing happens, and one after a silence clears it at once', () => {
    render(
      <JobEventsProvider>
        <Probe />
      </JobEventsProvider>,
    );
    const instance = FakeEventSource.instances[0];
    act(() => {
      instance.emit('snapshot', { scheduler: {}, at: new Date().toISOString() });
    });

    for (let i = 0; i < 8; i += 1) {
      act(() => {
        jest.advanceTimersByTime(25000);
        instance.emit('heartbeat', { at: new Date().toISOString() });
      });
    }
    expect(ProbeLastValue.isStale).toBe(false);

    act(() => {
      jest.advanceTimersByTime(90000);
    });
    expect(ProbeLastValue.isStale).toBe(true);
    act(() => {
      instance.emit('heartbeat', { at: new Date().toISOString() });
    });
    expect(ProbeLastValue.isStale).toBe(false);
  });

  test("staleness goes by when frames arrive, not the server's timestamps on them", () => {
    render(
      <JobEventsProvider>
        <Probe />
      </JobEventsProvider>,
    );
    const instance = FakeEventSource.instances[0];
    // A server whose clock is ten minutes behind this computer's.
    const behind = () => new Date(Date.now() - 10 * 60000).toISOString();
    act(() => {
      instance.emit('snapshot', { scheduler: {}, at: behind() });
    });
    act(() => {
      jest.advanceTimersByTime(30000);
      instance.emit('job', { type: 'job', seq: 1, at: behind() });
      jest.advanceTimersByTime(30000);
    });
    expect(ProbeLastValue.isStale).toBe(false);
  });

  test('a heartbeat changes nothing else: no poll, no job state', () => {
    const pollForDataChanges = jest.fn(() => Promise.resolve());
    render(
      <PrDataContext.Provider value={{ payload: { ok: true }, pollForDataChanges }}>
        <JobEventsProvider>
          <Probe />
        </JobEventsProvider>
      </PrDataContext.Provider>,
    );
    const instance = FakeEventSource.instances[0];
    const before = ProbeLastValue;
    act(() => {
      instance.emit('heartbeat', { at: new Date().toISOString() });
    });
    expect(pollForDataChanges).not.toHaveBeenCalled();
    expect(ProbeLastValue.jobs).toBe(before.jobs);
    expect(ProbeLastValue.lastSeq).toBe(before.lastSeq);
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
