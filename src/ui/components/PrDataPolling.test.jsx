/** @jest-environment jsdom */

const { render } = require('@testing-library/react');
const { PrDataPolling } = require('./PrDataPolling');

describe('PrDataPolling', () => {
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

  test('given the component mounts, when the data/scheduler poll interval elapses, then both bridges fire', () => {
    render(<PrDataPolling />);

    jest.advanceTimersByTime(30000);

    expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);
    expect(window.pollSchedulerStatus).toHaveBeenCalledTimes(1);
  });

  test('given the component mounts, when the backfill poll interval elapses, then the backfill bridge fires on its own faster cadence', () => {
    render(<PrDataPolling />);

    jest.advanceTimersByTime(5000);
    expect(window.pollBackfillStatus).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5000);
    expect(window.pollBackfillStatus).toHaveBeenCalledTimes(2);
    // Data/scheduler intervals haven't elapsed yet at 10s (30s cadence).
    expect(window.pollForDataChanges).not.toHaveBeenCalled();
  });

  test('given the component mounts, when 1 second elapses, then the activity-render bridge fires every second', () => {
    render(<PrDataPolling />);

    jest.advanceTimersByTime(3000);
    expect(window.renderRequestActivity).toHaveBeenCalledTimes(3);
  });

  test('given the tab becomes hidden, when the poll interval would have elapsed, then nothing fires; when visible again, polling resumes', () => {
    render(<PrDataPolling />);

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    jest.advanceTimersByTime(30000);
    expect(window.pollForDataChanges).not.toHaveBeenCalled();

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    jest.advanceTimersByTime(30000);
    expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);
  });

  test('given beforeunload fires, when the poll interval would have elapsed, then nothing fires', () => {
    render(<PrDataPolling />);

    window.dispatchEvent(new Event('beforeunload'));

    jest.advanceTimersByTime(30000);
    expect(window.pollForDataChanges).not.toHaveBeenCalled();
  });

  test('given the component unmounts, when the poll interval would have elapsed, then nothing fires (no leaked interval)', () => {
    const { unmount } = render(<PrDataPolling />);
    unmount();

    jest.advanceTimersByTime(30000);
    expect(window.pollForDataChanges).not.toHaveBeenCalled();
  });

  test('given no window.AUTO_DATA_POLL_MS/AUTO_BACKFILL_POLL_MS, when mounting, then it falls back to the default cadences', () => {
    delete window.AUTO_DATA_POLL_MS;
    delete window.AUTO_BACKFILL_POLL_MS;

    render(<PrDataPolling />);

    jest.advanceTimersByTime(30000);
    expect(window.pollForDataChanges).toHaveBeenCalledTimes(1);
  });
});
