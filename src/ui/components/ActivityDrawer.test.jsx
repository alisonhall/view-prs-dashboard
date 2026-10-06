/** @jest-environment jsdom */

const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { JobEventsContext } = require('../state/JobEventsContext');
const { ActivityDrawer } = require('./ActivityDrawer');

const baseJob = () => ({
  status: 'idle',
  startedAt: null,
  lastFinishedAt: null,
  lastOk: null,
  lastError: null,
  lastSkip: null,
});

const idleContextValue = {
  connection: 'open',
  isStale: false,
  jobs: {
    autoRefresh: baseJob(),
    quickCheck: { ...baseJob(), waitingOn: null },
    mergedQueueDrain: baseJob(),
  },
};

const renderDrawer = (props = {}, contextValue = idleContextValue) =>
  render(
    <JobEventsContext.Provider value={contextValue}>
      <ActivityDrawer {...props} />
    </JobEventsContext.Provider>,
  );

describe('ActivityDrawer', () => {
  test('is collapsed by default and shows no count when nothing is running', () => {
    renderDrawer();

    expect(screen.getByRole('button', { name: 'Activity' })).toBeInTheDocument();
    expect(screen.queryByText('Backfill')).not.toBeInTheDocument();
  });

  test('shows a running count on the toggle when a job is running', () => {
    renderDrawer({}, {
      ...idleContextValue,
      jobs: { ...idleContextValue.jobs, autoRefresh: { ...baseJob(), status: 'running' } },
    });

    expect(screen.getByRole('button', { name: 'Activity (1)' })).toBeInTheDocument();
  });

  test('clicking the toggle opens the panel with all three sections', () => {
    renderDrawer({
      backfillBadges: [{ text: 'Idle', className: 'scheduler-badge-idle' }],
      backfillDetailsText: 'Loading backfill status...',
      requestActivityBadges: [{ text: 'No request in progress', className: 'scheduler-badge-idle' }],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Activity' }));

    expect(screen.getByText('Scheduled background jobs')).toBeInTheDocument();
    expect(screen.getByText('Backfill')).toBeInTheDocument();
    expect(screen.getByText('In-flight user actions')).toBeInTheDocument();
    expect(screen.getByText('Idle', { selector: '.scheduler-badge' })).toBeInTheDocument();
    expect(screen.getByText('No request in progress')).toBeInTheDocument();
  });

  test('the close button closes the panel', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
    expect(screen.getByText('Backfill')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close activity panel' }));
    expect(screen.queryByText('Backfill')).not.toBeInTheDocument();
  });

  test('opening the panel moves focus to the close button', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }));

    expect(screen.getByRole('button', { name: 'Close activity panel' })).toHaveFocus();
  });

  test('pressing Escape while the panel is open closes it', () => {
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
    expect(screen.getByText('Backfill')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByText('Backfill')).not.toBeInTheDocument();
  });

  test('pressing Escape while the panel is closed does nothing', () => {
    renderDrawer();

    expect(() => fireEvent.keyDown(window, { key: 'Escape' })).not.toThrow();
    expect(screen.queryByText('Backfill')).not.toBeInTheDocument();
  });

  test('the keydown listener is removed when the panel closes (no leaked global listener)', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
    renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close activity panel' }));

    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeEventListenerSpy.mockRestore();
  });
});
