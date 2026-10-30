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

const badgeTexts = (display) => display.requestActivityBadges.map((badge) => String(badge.text));

describe('RequestActivityProvider', () => {
  afterEach(() => {
    delete global.fetch;
  });

  test('given the provider mounts, when read, then the badges already show the idle state and no recent activity', () => {
    const { read } = mount();

    expect(read().display.requestActivityBadges.length).toBeGreaterThan(0);
    expect(badgeTexts(read().display).some((text) => text.startsWith('Run script'))).toBe(false);
    expect(read().display.recentRequestActivity).toEqual([]);
  });

  test('given beginRequestActivity, when the returned finish function is called (twice), then the badges show the request while it runs and it lands in recent activity exactly once', () => {
    const { read } = mount();

    let finishActivity;
    act(() => {
      finishActivity = read().actions.beginRequestActivity('runScript');
    });
    expect(badgeTexts(read().display).some((text) => text.startsWith('Run script x1'))).toBe(true);
    expect(read().display.recentRequestActivity).toEqual([]);

    act(() => {
      finishActivity();
    });
    expect(badgeTexts(read().display).some((text) => text.startsWith('Run script'))).toBe(false);
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

  test('given renderSchedulerStatus with an in-progress auto run and active PRs, when called, then the "Auto run" badge shows and the table is told which PRs are active', () => {
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

    expect(badgeTexts(read().display).some((text) => text.startsWith('Auto run'))).toBe(true);
    expect(events).toEqual([{ activePrNumbers: [{ repo: 'owner/repo', prNumber: '7' }] }]);

    act(() => {
      read().actions.renderSchedulerStatus(null);
    });
    expect(badgeTexts(read().display).some((text) => text.startsWith('Auto run'))).toBe(false);
    expect(events.at(-1)).toEqual({ activePrNumbers: [] });
    window.removeEventListener('pr-active-progress-update', listener);
  });

  test('given loadOnMount, when mounted, then it loads the scheduler status once and renders it', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        scheduler: { isAutoRunInProgress: true, lastAutoAttemptAt: new Date().toISOString() },
      }),
    }));

    const { read } = mount({ loadOnMount: true });
    await act(async () => {});

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('/view-prs/scheduler');
    expect(badgeTexts(read().display).some((text) => text.startsWith('Auto run'))).toBe(true);
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
    expect(read().display.requestActivityBadges.length).toBeGreaterThan(0);
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
