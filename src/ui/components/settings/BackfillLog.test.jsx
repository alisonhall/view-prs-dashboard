/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { BackfillLog } = require('./BackfillLog');
const { BackfillStatusContext } = require('../../state/BackfillStatusContext');

// isBackfillRunning comes from BackfillStatusContext; supplied directly
// rather than mounting BackfillStatusProvider.
const tree = (props, { isBackfillRunning = false } = {}) => (
  <BackfillStatusContext.Provider value={{ isBackfillRunning }}>
    <BackfillLog logText="initial" logUpdateTick={0} onRefreshLog={() => {}} {...props} />
  </BackfillStatusContext.Provider>
);

// jsdom doesn't compute scrollHeight from content, so tests set it.
const logWithHeight = (scrollHeight) => {
  const log = screen.getByRole('region', { name: 'Backfill log' });
  Object.defineProperty(log, 'scrollHeight', { value: scrollHeight, configurable: true });
  log.scrollTop = 0;
  return log;
};

describe('BackfillLog', () => {
  test('it shows the log text, with auto-scroll on by default', () => {
    render(tree({ logText: 'backfill log line' }));

    expect(screen.getByRole('region', { name: 'Backfill log' })).toHaveTextContent('backfill log line');
    expect(screen.getByRole('checkbox', { name: 'Auto-scroll log while running' })).toBeChecked();
  });

  test('"Refresh log" calls onRefreshLog, and is disabled by refreshLogDisabled', async () => {
    const onRefreshLog = jest.fn();
    const user = userEvent.setup();
    const { rerender } = render(tree({ onRefreshLog }));

    await user.click(screen.getByRole('button', { name: 'Refresh log' }));
    expect(onRefreshLog).toHaveBeenCalledTimes(1);

    rerender(tree({ onRefreshLog, refreshLogDisabled: true }));
    expect(screen.getByRole('button', { name: 'Refresh log' })).toBeDisabled();
  });

  test('with auto-scroll on and a backfill running, each refresh scrolls to the end, even with unchanged text', () => {
    const { rerender } = render(tree({}, { isBackfillRunning: true }));
    const log = logWithHeight(900);

    rerender(tree({ logUpdateTick: 1 }, { isBackfillRunning: true }));

    expect(log.scrollTop).toBe(900);
  });

  test('with auto-scroll off, a refresh leaves the scroll position', async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree({}, { isBackfillRunning: true }));
    await user.click(screen.getByRole('checkbox', { name: 'Auto-scroll log while running' }));
    const log = logWithHeight(900);

    rerender(tree({ logText: 'initial\nmore lines', logUpdateTick: 1 }, { isBackfillRunning: true }));

    expect(log.scrollTop).toBe(0);
  });

  test('with no backfill running, a refresh leaves the scroll position, even with auto-scroll on', () => {
    const { rerender } = render(tree({}, { isBackfillRunning: false }));
    const log = logWithHeight(900);

    rerender(tree({ logText: 'initial\nmore lines', logUpdateTick: 1 }, { isBackfillRunning: false }));

    expect(log.scrollTop).toBe(0);
  });

  test('turning auto-scroll back on while a backfill runs scrolls to the end at once', async () => {
    const user = userEvent.setup();
    render(tree({}, { isBackfillRunning: true }));
    const checkbox = screen.getByRole('checkbox', { name: 'Auto-scroll log while running' });
    await user.click(checkbox);
    const log = logWithHeight(500);

    await user.click(checkbox);

    expect(log.scrollTop).toBe(500);
  });
});
