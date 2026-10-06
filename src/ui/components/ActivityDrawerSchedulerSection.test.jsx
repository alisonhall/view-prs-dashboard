/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { JobEventsContext } = require('../state/JobEventsContext');
const { ActivityDrawerSchedulerSection } = require('./ActivityDrawerSchedulerSection');

const baseJob = () => ({
  status: 'idle',
  startedAt: null,
  lastFinishedAt: null,
  lastOk: null,
  lastError: null,
  lastSkip: null,
});

const renderWithValue = (value) =>
  render(
    <JobEventsContext.Provider value={value}>
      <ActivityDrawerSchedulerSection />
    </JobEventsContext.Provider>,
  );

describe('ActivityDrawerSchedulerSection', () => {
  test('renders all three jobs as idle with no waitingOn copy by default', () => {
    renderWithValue({
      connection: 'open',
      isStale: false,
      jobs: {
        autoRefresh: baseJob(),
        quickCheck: { ...baseJob(), waitingOn: null },
        mergedQueueDrain: baseJob(),
      },
    });

    expect(screen.getByText('Auto refresh')).toBeInTheDocument();
    expect(screen.getByText('Quick check')).toBeInTheDocument();
    expect(screen.getByText('Merged/closed drain')).toBeInTheDocument();
    expect(screen.getAllByText('Idle')).toHaveLength(3);
    expect(screen.queryByText(/Waiting on auto refresh/)).not.toBeInTheDocument();
  });

  test('shows "Waiting on auto refresh" copy (not a queue position) when quickCheck is deferred', () => {
    renderWithValue({
      connection: 'open',
      isStale: false,
      jobs: {
        autoRefresh: { ...baseJob(), status: 'running' },
        quickCheck: { ...baseJob(), waitingOn: { job: 'autoRefresh', since: '2026-01-01T00:00:00.000Z' } },
        mergedQueueDrain: baseJob(),
      },
    });

    const waitingText = screen.getByText(/Waiting on auto refresh/);
    expect(waitingText).toBeInTheDocument();
    expect(waitingText.textContent).not.toMatch(/#|position|queue/i);
  });

  test('shows a connection banner when disconnected, and none when open and fresh', () => {
    const { rerender } = renderWithValue({
      connection: 'offline',
      isStale: false,
      jobs: { autoRefresh: baseJob(), quickCheck: { ...baseJob(), waitingOn: null }, mergedQueueDrain: baseJob() },
    });
    expect(screen.getByText(/disconnected/i)).toBeInTheDocument();

    rerender(
      <JobEventsContext.Provider
        value={{
          connection: 'open',
          isStale: false,
          jobs: { autoRefresh: baseJob(), quickCheck: { ...baseJob(), waitingOn: null }, mergedQueueDrain: baseJob() },
        }}
      >
        <ActivityDrawerSchedulerSection />
      </JobEventsContext.Provider>,
    );
    expect(screen.queryByText(/disconnected/i)).not.toBeInTheDocument();
  });

  test('shows a staleness banner when connection is open but isStale is true', () => {
    renderWithValue({
      connection: 'open',
      isStale: true,
      jobs: { autoRefresh: baseJob(), quickCheck: { ...baseJob(), waitingOn: null }, mergedQueueDrain: baseJob() },
    });

    expect(screen.getByText(/may be stale/i)).toBeInTheDocument();
  });

  test('shows the last skip reason when present', () => {
    renderWithValue({
      connection: 'open',
      isStale: false,
      jobs: {
        autoRefresh: {
          ...baseJob(),
          lastSkip: { reason: 'already-in-progress', at: '2026-01-01T00:00:00.000Z' },
        },
        quickCheck: { ...baseJob(), waitingOn: null },
        mergedQueueDrain: baseJob(),
      },
    });

    expect(screen.getByText(/Last skip: already-in-progress/)).toBeInTheDocument();
  });
});
