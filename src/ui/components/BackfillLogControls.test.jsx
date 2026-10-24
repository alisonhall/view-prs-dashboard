/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { BackfillLogControls } = require('./BackfillLogControls');
const { BackfillStatusContext } = require('../state/BackfillStatusContext');

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

// Phase H.14 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 4): isBackfillRunning now comes from useBackfillStatus()
// (BackfillStatusContext), not window.getBackfillTrackingState() - this
// is a lightweight unit test for BackfillLogControls in isolation, so it
// supplies that Context value directly instead of mounting the full
// BackfillStatusProvider (which itself needs a StatusTextProvider
// ancestor, irrelevant machinery for what this file tests).
const renderWithBackfillStatus = (ui, { isBackfillRunning = false } = {}) =>
  render(
    <BackfillStatusContext.Provider value={{ isBackfillRunning }}>
      {ui}
    </BackfillStatusContext.Provider>,
  );

describe('BackfillLogControls', () => {
  afterEach(() => {
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
    const logContainer = createLogContainer(500);
    logContainer.scrollTop = 0;

    const { rerender } = renderWithBackfillStatus(
      <BackfillLogControls logText="initial" logUpdateTick={0} logContainer={logContainer} />,
      { isBackfillRunning: true },
    );
    expect(logContainer.scrollTop).toBe(500);

    Object.defineProperty(logContainer, 'scrollHeight', { value: 900, configurable: true });
    logContainer.scrollTop = 0;
    rerender(
      <BackfillStatusContext.Provider value={{ isBackfillRunning: true }}>
        <BackfillLogControls logText="initial" logUpdateTick={1} logContainer={logContainer} />
      </BackfillStatusContext.Provider>,
    );

    expect(logContainer.scrollTop).toBe(900);
  });

  test('given autoscroll unchecked, when a refresh lands, then scrollTop is left unchanged', async () => {
    const logContainer = createLogContainer(500);
    logContainer.scrollTop = 0;
    const user = userEvent.setup();

    const { rerender } = renderWithBackfillStatus(
      <BackfillLogControls logText="initial" logUpdateTick={0} logContainer={logContainer} />,
      { isBackfillRunning: true },
    );
    await user.click(screen.getByRole('checkbox', { name: /Auto-scroll log while running/ }));
    logContainer.scrollTop = 0;

    rerender(
      <BackfillStatusContext.Provider value={{ isBackfillRunning: true }}>
        <BackfillLogControls logText="initial\nmore lines" logUpdateTick={1} logContainer={logContainer} />
      </BackfillStatusContext.Provider>,
    );

    expect(logContainer.scrollTop).toBe(0);
  });

  test('given backfill not running, when a refresh lands, then scrollTop is left unchanged even with autoscroll checked', () => {
    const logContainer = createLogContainer(500);
    logContainer.scrollTop = 0;

    const { rerender } = renderWithBackfillStatus(
      <BackfillLogControls logText="initial" logUpdateTick={0} logContainer={logContainer} />,
      { isBackfillRunning: false },
    );
    rerender(
      <BackfillStatusContext.Provider value={{ isBackfillRunning: false }}>
        <BackfillLogControls logText="initial\nmore lines" logUpdateTick={1} logContainer={logContainer} />
      </BackfillStatusContext.Provider>,
    );

    expect(logContainer.scrollTop).toBe(0);
  });

  test('given the user checks the box while backfill is running, when toggled, then scroll position syncs immediately', async () => {
    const logContainer = createLogContainer(500);
    logContainer.scrollTop = 0;
    const user = userEvent.setup();

    renderWithBackfillStatus(
      <BackfillLogControls logText="initial" logContainer={logContainer} />,
      { isBackfillRunning: true },
    );
    const checkbox = screen.getByRole('checkbox', { name: /Auto-scroll log while running/ });
    await user.click(checkbox); // unchecks (starts defaultChecked)
    logContainer.scrollTop = 0;
    await user.click(checkbox); // re-checks

    expect(logContainer.scrollTop).toBe(500);
  });
});
