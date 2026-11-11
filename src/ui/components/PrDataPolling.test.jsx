/** @jest-environment jsdom */

const React = require('react');
const { render } = require('@testing-library/react');
const {
  PrDataPolling,
  AUTO_DATA_POLL_MS,
  AUTO_BACKFILL_POLL_MS,
  MIN_DATA_POLL_MS,
  PUSHED_DATA_POLL_MS,
  readDataPollMsOverride,
} = require('./PrDataPolling');
const { PrDataContext } = require('../state/PrDataContext');
const { JobEventsContext } = require('../state/JobEventsContext');
const { RequestActivityContext } = require('../state/RequestActivityContext');

// Phase F/F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// pollForDataChanges/pollBackfillStatus/renderRequestActivity now all come
// from usePrData() (<PrDataProvider />'s own Context value), not
// window.pollForDataChanges/pollBackfillStatus/renderRequestActivity
// directly - this harness provides a minimal Context whose 3 functions
// each delegate to the matching window.* mock every assertion below
// already checks, so the rest of this file's tests need no other changes.
const renderPrDataPolling = (props = {}) =>
  render(
    React.createElement(
      PrDataContext.Provider,
      {
        value: {
          pollForDataChanges: (...args) => window.pollForDataChanges?.(...args),
          pollBackfillStatus: (...args) => window.pollBackfillStatus?.(...args),
        },
      },
      // Window-bridge elimination Phase 7.3: renderRequestActivity comes from
      // RequestActivityProvider's Context now; same window.* mock delegation.
      React.createElement(
        RequestActivityContext.Provider,
        { value: { renderRequestActivity: (...args) => window.renderRequestActivity?.(...args) } },
        React.createElement(PrDataPolling, props),
      ),
    ),
  );

describe('PrDataPolling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.pollForDataChanges = jest.fn();
    window.pollSchedulerStatus = jest.fn();
    window.pollBackfillStatus = jest.fn();
    window.renderRequestActivity = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete window.pollForDataChanges;
    delete window.pollSchedulerStatus;
    delete window.pollBackfillStatus;
    delete window.renderRequestActivity;
  });

  test('given the component mounts, when the data poll interval elapses, then the bridge fires', () => {
    renderPrDataPolling();

    jest.advanceTimersByTime(30000);

    expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);
  });

  test('given the component mounts, then it never fires window.pollSchedulerStatus itself - that poll was retired in favor of SSE (see JobEventsProvider)', () => {
    renderPrDataPolling();

    jest.advanceTimersByTime(60000);

    expect(window.pollSchedulerStatus).not.toHaveBeenCalled();
  });

  test('given the component mounts, when the backfill poll interval elapses, then the backfill bridge fires on its own faster cadence', () => {
    renderPrDataPolling();

    jest.advanceTimersByTime(5000);
    expect(window.pollBackfillStatus).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5000);
    expect(window.pollBackfillStatus).toHaveBeenCalledTimes(2);
    // Data/scheduler intervals haven't elapsed yet at 10s (30s cadence).
    expect(window.pollForDataChanges).not.toHaveBeenCalled();
  });

  test('given the component mounts, when 1 second elapses, then the activity-render bridge fires every second', () => {
    renderPrDataPolling();

    jest.advanceTimersByTime(3000);
    expect(window.renderRequestActivity).toHaveBeenCalledTimes(3);
  });

  test('given the tab becomes hidden, when the poll interval would have elapsed, then nothing fires; when visible again, polling resumes', () => {
    renderPrDataPolling();

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    jest.advanceTimersByTime(30000);
    expect(window.pollForDataChanges).not.toHaveBeenCalled();

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    jest.advanceTimersByTime(30000);
    expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);
  });

  test('given polling is running, when a "visible" event arrives without a "hidden" one first, then each poll still fires once per interval (no duplicate timers)', () => {
    renderPrDataPolling();

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('visibilitychange'));

    jest.advanceTimersByTime(30000);
    expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);
    expect(window.pollBackfillStatus).toHaveBeenCalledTimes(6);
    expect(window.renderRequestActivity).toHaveBeenCalledTimes(30);
  });

  test('given beforeunload fires, when the poll interval would have elapsed, then nothing fires', () => {
    renderPrDataPolling();

    window.dispatchEvent(new Event('beforeunload'));

    jest.advanceTimersByTime(30000);
    expect(window.pollForDataChanges).not.toHaveBeenCalled();
  });

  test('given the component unmounts, when the poll interval would have elapsed, then nothing fires (no leaked interval)', () => {
    const { unmount } = renderPrDataPolling();
    unmount();

    jest.advanceTimersByTime(30000);
    expect(window.pollForDataChanges).not.toHaveBeenCalled();
  });

  // Window-bridge elimination Phase 7.3: the cadences are this module's own
  // constants now (index.page.js used to publish them as window.AUTO_*).
  test('given the exported cadences, when each elapses, then its poll fires exactly then', () => {
    expect(AUTO_DATA_POLL_MS).toBe(30000);
    expect(AUTO_BACKFILL_POLL_MS).toBe(5000);
    renderPrDataPolling();

    jest.advanceTimersByTime(AUTO_BACKFILL_POLL_MS - 1);
    expect(window.pollBackfillStatus).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(window.pollBackfillStatus).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(AUTO_DATA_POLL_MS - AUTO_BACKFILL_POLL_MS - 1);
    expect(window.pollForDataChanges).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);
  });

  test('given a dataPollMs prop, when it elapses, then the data poll fires on that cadence instead', () => {
    renderPrDataPolling({ dataPollMs: 300 });

    jest.advanceTimersByTime(299);
    expect(window.pollForDataChanges).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(600);
    expect(window.pollForDataChanges).toHaveBeenCalledTimes(3);
  });

  // The server pushes "data-changed" over the open stream, so the poll is
  // only a safety net then; back to every 30s when the stream drops.
  test('given the event stream is open, then the data poll slows to its safety-net cadence', () => {
    const renderWithConnection = (connection) =>
      React.createElement(
        JobEventsContext.Provider,
        { value: { connection } },
        React.createElement(
          PrDataContext.Provider,
          { value: { pollForDataChanges: (...args) => window.pollForDataChanges?.(...args) } },
          React.createElement(PrDataPolling),
        ),
      );
    const { rerender } = render(renderWithConnection('open'));

    jest.advanceTimersByTime(AUTO_DATA_POLL_MS);
    expect(window.pollForDataChanges).not.toHaveBeenCalled();
    jest.advanceTimersByTime(PUSHED_DATA_POLL_MS - AUTO_DATA_POLL_MS);
    expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);

    rerender(renderWithConnection('reconnecting'));
    jest.advanceTimersByTime(AUTO_DATA_POLL_MS);
    expect(window.pollForDataChanges).toHaveBeenCalledTimes(2);
  });

  // Open but delivering nothing - not even the heartbeat - for a minute:
  // pushed changes may not be arriving, so the poll is back to every 30s
  // until frames do.
  test('given the open event stream goes stale, then the data poll is back to every 30s until it delivers again', () => {
    const renderWith = (isStale) =>
      React.createElement(
        JobEventsContext.Provider,
        { value: { connection: 'open', isStale } },
        React.createElement(
          PrDataContext.Provider,
          { value: { pollForDataChanges: (...args) => window.pollForDataChanges?.(...args) } },
          React.createElement(PrDataPolling),
        ),
      );
    const { rerender } = render(renderWith(true));

    jest.advanceTimersByTime(AUTO_DATA_POLL_MS);
    expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);

    rerender(renderWith(false));
    jest.advanceTimersByTime(AUTO_DATA_POLL_MS);
    expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);
  });

  test('given the event stream is open, a dataPollMs prop still sets the cadence', () => {
    render(
      React.createElement(
        JobEventsContext.Provider,
        { value: { connection: 'open' } },
        React.createElement(
          PrDataContext.Provider,
          { value: { pollForDataChanges: (...args) => window.pollForDataChanges?.(...args) } },
          React.createElement(PrDataPolling, { dataPollMs: 300 }),
        ),
      ),
    );

    jest.advanceTimersByTime(300);
    expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);
  });

  describe('readDataPollMsOverride', () => {
    test.each([
      ['?dataPollMs=300', 300],
      ['?foo=1&dataPollMs=1500', 1500],
      [`?dataPollMs=${MIN_DATA_POLL_MS}`, MIN_DATA_POLL_MS],
    ])('given %s, when read, then it returns %d', (search, expected) => {
      expect(readDataPollMsOverride(search)).toBe(expected);
    });

    test.each([
      [''],
      ['?foo=1'],
      ['?dataPollMs='],
      ['?dataPollMs=abc'],
      ['?dataPollMs=-5'],
      ['?dataPollMs=1.5'],
      [`?dataPollMs=${MIN_DATA_POLL_MS - 1}`],
      [undefined],
    ])('given %p, when read, then it falls back to the default (undefined)', (search) => {
      expect(readDataPollMsOverride(search)).toBeUndefined();
    });
  });
});
