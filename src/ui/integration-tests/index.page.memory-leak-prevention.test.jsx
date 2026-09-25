/** @jest-environment jsdom */

/**
 * Memory Leak Prevention Tests
 *
 * Track C, slice C1 (post-Phase-6 follow-up, see REACT_MIGRATION_PLAN.md):
 * interval-lifecycle ownership moved from index.page.js's own
 * setInterval/cleanupIntervals/restartIntervals into
 * components/PrDataPolling.jsx. This suite used to assert on the literal
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

const { render } = require('@testing-library/react');
const { PrDataPolling } = require('../components/PrDataPolling');

describe('Memory leak prevention', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.pollForDataChanges = jest.fn();
    window.pollSchedulerStatus = jest.fn();
    window.pollBackfillStatus = jest.fn();
    window.renderRequestActivity = jest.fn();
    window.AUTO_DATA_POLL_MS = 30000;
    window.AUTO_BACKFILL_POLL_MS = 5000;
  });

  afterEach(() => {
    jest.useRealTimers();
    delete window.pollForDataChanges;
    delete window.pollSchedulerStatus;
    delete window.pollBackfillStatus;
    delete window.renderRequestActivity;
    delete window.AUTO_DATA_POLL_MS;
    delete window.AUTO_BACKFILL_POLL_MS;
  });

  describe('interval registration', () => {
    test('given the component mounts, when each interval elapses, then all 4 interval types actually fire', () => {
      render(<PrDataPolling />);

      jest.advanceTimersByTime(30000);
      expect(window.pollForDataChanges).toHaveBeenCalled();
      expect(window.pollSchedulerStatus).toHaveBeenCalled();
      expect(window.pollBackfillStatus).toHaveBeenCalled();
      expect(window.renderRequestActivity).toHaveBeenCalled();
    });
  });

  describe('cleanup on unmount', () => {
    test('given the component unmounts, when checking for leaked timers, then no interval types fire again afterward', () => {
      const { unmount } = render(<PrDataPolling />);
      jest.advanceTimersByTime(30000);
      const callCountsBeforeUnmount = {
        data: window.pollForDataChanges.mock.calls.length,
        scheduler: window.pollSchedulerStatus.mock.calls.length,
        backfill: window.pollBackfillStatus.mock.calls.length,
        activity: window.renderRequestActivity.mock.calls.length,
      };

      unmount();
      jest.advanceTimersByTime(60000);

      expect(window.pollForDataChanges.mock.calls.length).toBe(callCountsBeforeUnmount.data);
      expect(window.pollSchedulerStatus.mock.calls.length).toBe(callCountsBeforeUnmount.scheduler);
      expect(window.pollBackfillStatus.mock.calls.length).toBe(callCountsBeforeUnmount.backfill);
      expect(window.renderRequestActivity.mock.calls.length).toBe(callCountsBeforeUnmount.activity);
    });
  });

  describe('visibility change handling', () => {
    test('given the tab becomes hidden, when intervals would have elapsed, then all 4 interval types stop firing', () => {
      render(<PrDataPolling />);

      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      jest.advanceTimersByTime(60000);
      expect(window.pollForDataChanges).not.toHaveBeenCalled();
      expect(window.pollSchedulerStatus).not.toHaveBeenCalled();
      expect(window.pollBackfillStatus).not.toHaveBeenCalled();
      expect(window.renderRequestActivity).not.toHaveBeenCalled();
    });

    test('given the tab becomes hidden then visible again, when intervals elapse, then all 4 interval types resume firing', () => {
      render(<PrDataPolling />);

      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      jest.advanceTimersByTime(30000);
      expect(window.pollForDataChanges).toHaveBeenCalled();
      expect(window.pollSchedulerStatus).toHaveBeenCalled();
      expect(window.pollBackfillStatus).toHaveBeenCalled();
      expect(window.renderRequestActivity).toHaveBeenCalled();
    });
  });

  describe('beforeunload handling', () => {
    test('given beforeunload fires, when intervals would have elapsed, then all 4 interval types stop firing', () => {
      render(<PrDataPolling />);

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
      const { unmount } = render(<PrDataPolling />);

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
