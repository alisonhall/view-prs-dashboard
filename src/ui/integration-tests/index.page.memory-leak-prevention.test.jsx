/** @jest-environment jsdom */

/**
 * Memory Leak Prevention Tests
 *
 * Track C, slice C1 (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * interval-lifecycle ownership moved from index.page.js's own
 * setInterval/cleanupIntervals/restartIntervals into
 * components/PrDataPolling.tsx. This suite used to assert on the literal
 * source text of index.page.js (which pattern existed, textually) - now
 * that the pattern lives in a real React component, it's tested
 * behaviorally instead: mount/unmount and visibility/beforeunload events
 * actually start and stop real timers, verified via jest fake timers.
 * See src/ui/components/PrDataPolling.test.jsx for the fuller behavioral
 * suite (per-interval cadence, etc.) - this file keeps the same "memory
 * leak prevention" framing/test names for continuity, but each test now
 * verifies real interval start/stop instead of matching regex against
 * index.page.js's source.
 */

const React = require('react');
const { render } = require('@testing-library/react');
const { PrDataPolling } = require('../components/PrDataPolling');
const { PrDataContext } = require('../state/PrDataContext');
const { RequestActivityContext } = require('../state/RequestActivityContext');

// Phase F/F.2 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// pollForDataChanges/pollBackfillStatus/renderRequestActivity now all come
// from usePrData(), not window.* directly - see PrDataPolling.test.jsx's
// own identical harness comment.
const renderPrDataPolling = () =>
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
        React.createElement(PrDataPolling),
      ),
    ),
  );

describe('Memory leak prevention', () => {
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

  describe('interval registration', () => {
    test('given the component mounts, when each interval elapses, then all 3 remaining interval types actually fire', () => {
      renderPrDataPolling();

      jest.advanceTimersByTime(30000);
      expect(window.pollForDataChanges).toHaveBeenCalled();
      expect(window.pollBackfillStatus).toHaveBeenCalled();
      expect(window.renderRequestActivity).toHaveBeenCalled();
    });

    test('given the component mounts, then window.pollSchedulerStatus is never called - that interval was retired in favor of SSE (see JobEventsProvider)', () => {
      renderPrDataPolling();

      jest.advanceTimersByTime(60000);
      expect(window.pollSchedulerStatus).not.toHaveBeenCalled();
    });
  });

  describe('cleanup on unmount', () => {
    test('given the component unmounts, when checking for leaked timers, then no interval types fire again afterward', () => {
      const { unmount } = renderPrDataPolling();
      jest.advanceTimersByTime(30000);
      const callCountsBeforeUnmount = {
        data: window.pollForDataChanges.mock.calls.length,
        backfill: window.pollBackfillStatus.mock.calls.length,
        activity: window.renderRequestActivity.mock.calls.length,
      };

      unmount();
      jest.advanceTimersByTime(60000);

      expect(window.pollForDataChanges.mock.calls.length).toBe(callCountsBeforeUnmount.data);
      expect(window.pollBackfillStatus.mock.calls.length).toBe(callCountsBeforeUnmount.backfill);
      expect(window.renderRequestActivity.mock.calls.length).toBe(callCountsBeforeUnmount.activity);
    });
  });

  describe('visibility change handling', () => {
    test('given the tab becomes hidden, when intervals would have elapsed, then all 4 interval types stop firing', () => {
      renderPrDataPolling();

      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      jest.advanceTimersByTime(60000);
      expect(window.pollForDataChanges).not.toHaveBeenCalled();
      expect(window.pollSchedulerStatus).not.toHaveBeenCalled();
      expect(window.pollBackfillStatus).not.toHaveBeenCalled();
      expect(window.renderRequestActivity).not.toHaveBeenCalled();
    });

    test('given the tab becomes hidden then visible again, when intervals elapse, then all 4 interval types resume firing', () => {
      renderPrDataPolling();

      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      jest.advanceTimersByTime(30000);
      expect(window.pollForDataChanges).toHaveBeenCalled();
      expect(window.pollBackfillStatus).toHaveBeenCalled();
      expect(window.renderRequestActivity).toHaveBeenCalled();
    });
  });

  describe('beforeunload handling', () => {
    test('given beforeunload fires, when intervals would have elapsed, then all 4 interval types stop firing', () => {
      renderPrDataPolling();

      window.dispatchEvent(new Event('beforeunload'));

      jest.advanceTimersByTime(60000);
      expect(window.pollForDataChanges).not.toHaveBeenCalled();
      expect(window.pollSchedulerStatus).not.toHaveBeenCalled();
      expect(window.pollBackfillStatus).not.toHaveBeenCalled();
      expect(window.renderRequestActivity).not.toHaveBeenCalled();
    });
  });

  describe('integration - memory leak prevention pattern', () => {
    test('given a full mount/hide/show/unmount cycle, when checking behavior throughout, then intervals only ever fire while mounted and visible', () => {
      const { unmount } = renderPrDataPolling();

      jest.advanceTimersByTime(30000);
      expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      jest.advanceTimersByTime(30000);
      expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      jest.advanceTimersByTime(30000);
      expect(window.pollForDataChanges).toHaveBeenCalledTimes(2);

      unmount();
      jest.advanceTimersByTime(30000);
      expect(window.pollForDataChanges).toHaveBeenCalledTimes(2);
    });
  });
});
