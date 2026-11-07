/** @jest-environment jsdom */

const { memo } = require('react');
const { render, act } = require('@testing-library/react');
const { RequestActivityProvider } = require('./RequestActivityProvider');
const { useRequestActivity, useRequestActivityDisplay } = require('../state/RequestActivityContext');

// Window-bridge elimination Phase 7.3 (see WINDOW_BRIDGE_ELIMINATION_PLAN.md):
// request activity moved here from PrDataProvider (its first two tests below
// moved with it, from PrDataProvider.test.jsx), and the scheduler state from
// index.page.js. The badges/recent list are this Provider's own state now,
// instead of being pushed into the old AppRoot through
// window.updateReactRequestActivityBadges/updateReactRecentRequestActivity.
function Probe({ onValue }) {
  onValue({ actions: useRequestActivity(), display: useRequestActivityDisplay() });
  return null;
}

const mount = (props = {}) => {
  let latest;
  const view = render(
    <RequestActivityProvider {...props}>
      <Probe onValue={(value) => (latest = value)} />
    </RequestActivityProvider>,
  );
  return { view, read: () => latest };
};

const activeKeys = (display) => display.activeRequests.map((request) => request.key);

describe('RequestActivityProvider', () => {
  afterEach(() => {
    delete global.fetch;
  });

  test('given the provider mounts, when read, then nothing is in flight and there is no recent activity', () => {
    const { read } = mount();

    expect(read().display.activeRequests).toEqual([]);
    expect(read().display.recentRequestActivity).toEqual([]);
  });

  test('given beginRequestActivity, when the returned finish function is called (twice), then the request is in flight while it runs and lands in recent activity exactly once', () => {
    const { read } = mount();

    let finishActivity;
    act(() => {
      finishActivity = read().actions.beginRequestActivity('runScript');
    });
    expect(read().display.activeRequests).toEqual([
      expect.objectContaining({ key: 'runScript', label: 'Run script', count: 1, startedAtMs: expect.any(Number) }),
    ]);
    expect(read().display.recentRequestActivity).toEqual([]);

    act(() => {
      finishActivity();
    });
    expect(read().display.activeRequests).toEqual([]);
    expect(read().display.recentRequestActivity).toHaveLength(1);
    expect(read().display.recentRequestActivity[0]).toEqual(
      expect.objectContaining({ key: 'runScript', label: 'Run script' }),
    );

    // Calling the same finish function again is a no-op (same guard
    // beginRequestActivity always had).
    act(() => {
      finishActivity();
    });
    expect(read().display.recentRequestActivity).toHaveLength(1);
  });

  test('given renderSchedulerStatus with active PRs, when called, then the table is told which PRs are active (the auto run itself is the popover\'s job row, not a request)', () => {
    const { read } = mount();
    const events = [];
    const listener = (event) => events.push(event.detail);
    window.addEventListener('pr-active-progress-update', listener);

    act(() => {
      read().actions.renderSchedulerStatus({
        isAutoRunInProgress: true,
        lastAutoAttemptAt: new Date().toISOString(),
        activePrNumbers: [{ repo: 'owner/repo', prNumber: '7' }],
      });
    });

    expect(read().display.activeRequests).toEqual([]);
    expect(events).toEqual([{ activePrNumbers: [{ repo: 'owner/repo', prNumber: '7' }], queuedPrNumbers: [] }]);

    act(() => {
      read().actions.renderSchedulerStatus(null);
    });
    expect(events.at(-1)).toEqual({ activePrNumbers: [], queuedPrNumbers: [] });
    window.removeEventListener('pr-active-progress-update', listener);
  });

  test('given loadOnMount, when mounted, then it loads the scheduler status once and announces its active PRs', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        scheduler: { isAutoRunInProgress: true, activePrNumbers: [{ repo: 'owner/repo', prNumber: '9' }] },
      }),
    }));
    const events = [];
    const listener = (event) => events.push(event.detail);
    window.addEventListener('pr-active-progress-update', listener);

    mount({ loadOnMount: true });
    await act(async () => {});
    window.removeEventListener('pr-active-progress-update', listener);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/view-prs/scheduler');
    expect(events).toEqual([{ activePrNumbers: [{ repo: 'owner/repo', prNumber: '9' }], queuedPrNumbers: [] }]);
  });

  test('given no loadOnMount, when mounted, then it never fetches; and a failed startup load is ignored', async () => {
    global.fetch = jest.fn();
    mount();
    await act(async () => {});
    expect(global.fetch).not.toHaveBeenCalled();

    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({ ok: false, error: 'boom' }) }));
    const { read } = mount({ loadOnMount: true });
    await act(async () => {});
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(read().display.activeRequests).toEqual([]);
  });

  // Lesson 1 of the plan: many hooks (and three Providers) read these
  // functions; if their Context changed on every activity tick, they'd all
  // re-render with it.
  test('given activity updates, when the functions are read, then their identity never changes and a memoized consumer of them does not re-render', () => {
    let renders = 0;
    let firstActions;
    const ActionsConsumer = memo(function ActionsConsumer() {
      const actions = useRequestActivity();
      renders += 1;
      firstActions = firstActions || actions;
      return null;
    });
    let latest;
    render(
      <RequestActivityProvider>
        <Probe onValue={(value) => (latest = value)} />
        <ActionsConsumer />
      </RequestActivityProvider>,
    );
    const rendersAfterMount = renders;

    act(() => {
      const finish = latest.actions.beginRequestActivity('dataLoad');
      finish();
    });
    act(() => {
      latest.actions.renderSchedulerStatus({ isAutoRunInProgress: true });
    });

    expect(latest.actions).toBe(firstActions);
    expect(renders).toBe(rendersAfterMount);
  });
});

describe('RequestActivityProvider request thresholds', () => {
  test('a request warns after 2 minutes and looks stuck after 6, but a fetch of older merged PRs - several minutes when working - only after 10 and 20', () => {
    const { read } = mount();
    act(() => {
      read().actions.beginRequestActivity('olderMerged');
      read().actions.beginRequestActivity('runScript');
      read().actions.beginRequestActivity('runScript');
    });

    const byKey = Object.fromEntries(read().display.activeRequests.map((request) => [request.key, request]));
    expect(activeKeys(read().display)).toEqual(['runScript', 'olderMerged']);
    expect(byKey.runScript).toEqual(expect.objectContaining({ count: 2, thresholds: { warnMs: 120000, criticalMs: 360000 } }));
    expect(byKey.olderMerged.thresholds).toEqual({ warnMs: 600000, criticalMs: 1200000 });
  });
});
