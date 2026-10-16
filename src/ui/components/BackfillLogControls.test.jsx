/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { BackfillLogControls } = require('./BackfillLogControls');

// Phase G.4 (see REACT_MIGRATION_PLAN.md, "Full migration roadmap"):
// BackfillLogControls now owns the #backfill-log content portal itself
// and syncs scroll position via a ref, instead of the old
// window.autoScrollBackfillLogToBottom DOM-query bridge - these tests
// exercise that real scroll behavior directly. jsdom doesn't compute
// scrollHeight from content, so it's set explicitly per test.
const createLogContainer = (scrollHeight) => {
  const node = document.createElement('pre');
  node.id = 'backfill-log';
  Object.defineProperty(node, 'scrollHeight', { value: scrollHeight, configurable: true });
  document.body.appendChild(node);
  return node;
};

describe('BackfillLogControls', () => {
  afterEach(() => {
    delete window.getBackfillTrackingState;
    document.body.innerHTML = '';
  });

  test('given default rendering, when checking the checkbox, then it starts checked and uncontrolled', () => {
    render(<BackfillLogControls />);

    const checkbox = screen.getByRole('checkbox', { name: /Auto-scroll log while running/ });
    expect(checkbox).toBeChecked();
  });

  test('given refreshLogDisabled is true, when rendering, then the refresh log button is disabled', () => {
    render(<BackfillLogControls refreshLogDisabled />);

    expect(screen.getByRole('button', { name: 'Refresh log' })).toBeDisabled();
  });

  test('given a user clicks "Refresh log", when clicked, then onRefreshLog fires', async () => {
    const onRefreshLog = jest.fn();
    const user = userEvent.setup();
    render(<BackfillLogControls onRefreshLog={onRefreshLog} />);

    await user.click(screen.getByRole('button', { name: 'Refresh log' }));

    expect(onRefreshLog).toHaveBeenCalledTimes(1);
  });

  test('given logContainer is provided, when rendering, then logText is portaled into it', () => {
    const logContainer = createLogContainer(100);
    render(<BackfillLogControls logText="backfill log line" logContainer={logContainer} />);

    expect(logContainer.textContent).toBe('backfill log line');
  });

  test('given autoscroll checked and backfill running, when a refresh lands (even with unchanged text), then scrollTop follows scrollHeight', () => {
    // logUpdateTick (not logText) is the effect's real dependency - a
    // refresh that happens to fetch identical text must still re-sync,
    // same as react-app.jsx's own backfillLogUpdateTick (see its comment).
    window.getBackfillTrackingState = () => ({ isBackfillRunning: true });
    const logContainer = createLogContainer(500);
    logContainer.scrollTop = 0;

    const { rerender } = render(
      <BackfillLogControls logText="initial" logUpdateTick={0} logContainer={logContainer} />,
    );
    expect(logContainer.scrollTop).toBe(500);

    Object.defineProperty(logContainer, 'scrollHeight', { value: 900, configurable: true });
    logContainer.scrollTop = 0;
    rerender(<BackfillLogControls logText="initial" logUpdateTick={1} logContainer={logContainer} />);

    expect(logContainer.scrollTop).toBe(900);
  });

  test('given autoscroll unchecked, when a refresh lands, then scrollTop is left unchanged', async () => {
    window.getBackfillTrackingState = () => ({ isBackfillRunning: true });
    const logContainer = createLogContainer(500);
    logContainer.scrollTop = 0;
    const user = userEvent.setup();

    const { rerender } = render(
      <BackfillLogControls logText="initial" logUpdateTick={0} logContainer={logContainer} />,
    );
    await user.click(screen.getByRole('checkbox', { name: /Auto-scroll log while running/ }));
    logContainer.scrollTop = 0;

    rerender(<BackfillLogControls logText="initial\nmore lines" logUpdateTick={1} logContainer={logContainer} />);

    expect(logContainer.scrollTop).toBe(0);
  });

  test('given backfill not running, when a refresh lands, then scrollTop is left unchanged even with autoscroll checked', () => {
    window.getBackfillTrackingState = () => ({ isBackfillRunning: false });
    const logContainer = createLogContainer(500);
    logContainer.scrollTop = 0;

    const { rerender } = render(
      <BackfillLogControls logText="initial" logUpdateTick={0} logContainer={logContainer} />,
    );
    rerender(<BackfillLogControls logText="initial\nmore lines" logUpdateTick={1} logContainer={logContainer} />);

    expect(logContainer.scrollTop).toBe(0);
  });

  test('given the user checks the box while backfill is running, when toggled, then scroll position syncs immediately', async () => {
    window.getBackfillTrackingState = () => ({ isBackfillRunning: true });
    const logContainer = createLogContainer(500);
    logContainer.scrollTop = 0;
    const user = userEvent.setup();

    render(<BackfillLogControls logText="initial" logContainer={logContainer} />);
    const checkbox = screen.getByRole('checkbox', { name: /Auto-scroll log while running/ });
    await user.click(checkbox); // unchecks (starts defaultChecked)
    logContainer.scrollTop = 0;
    await user.click(checkbox); // re-checks

    expect(logContainer.scrollTop).toBe(500);
  });
});
