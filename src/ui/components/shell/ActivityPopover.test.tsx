/** @jest-environment jsdom */

import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobEventsContext, type JobEventsValue } from '../../state/JobEventsContext';
import { BackfillStatusContext, DEFAULT_BACKFILL_BUTTON_STATE, type BackfillStatusValue } from '../../state/BackfillStatusContext';
import { RequestActivityDisplayContext } from '../../state/RequestActivityContext';
import { createPrJobEventsHelpers } from '../../helpers/pr-job-events.helpers.ts';
import { ActivityPopover } from './ActivityPopover';

// The popover's Run now and Reset requests.
const mockBump = jest.fn(async (_repo: string, _taskType: string) => undefined);
const mockReset = jest.fn(async () => undefined);
jest.mock('../../state/useActivityDrawerActions', () => ({
  useActivityDrawerActions: () => ({ handleDispatcherBump: mockBump, handleResetCircuitBreaker: mockReset }),
}));
beforeEach(() => {
  mockBump.mockClear();
  mockReset.mockClear();
});

const { getInitialJobEventsState } = createPrJobEventsHelpers();
const jobEvents = (overrides: Partial<JobEventsValue> = {}): JobEventsValue => ({
  ...getInitialJobEventsState(),
  connection: 'open',
  isStale: false,
  ...overrides,
});
const backfill: BackfillStatusValue = {
  backfillButtonState: DEFAULT_BACKFILL_BUTTON_STATE,
  backfillBadges: { badges: [{ text: 'Backfill: stopped', className: 'scheduler-badge-stopped' }] },
  backfillDetailsText: 'Last run: never',
  backfillLogText: '',
  backfillLogUpdateTick: 0,
  hasBackfillStatusError: false,
  isBackfillRunning: false,
  isBackfillActionPending: false,
  supportsBackfillLogPolling: true,
};

const renderPopover = (events = jobEvents(), extra?: ReactNode) =>
  render(
    <JobEventsContext.Provider value={events}>
      <BackfillStatusContext.Provider value={backfill}>
        <RequestActivityDisplayContext.Provider value={{ activeRequests: [], recentRequestActivity: [] }}>
          <ActivityPopover />
          {extra}
        </RequestActivityDisplayContext.Provider>
      </BackfillStatusContext.Provider>
    </JobEventsContext.Provider>,
  );

const button = () => screen.getByRole('button', { name: /^Activity/ });

describe('ActivityPopover', () => {
  test('closed at first; its button names the running jobs when there are any', () => {
    const { rerender } = renderPopover();
    expect(button()).toHaveAccessibleName('Activity');
    expect(button()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const running = jobEvents();
    running.jobs = { ...running.jobs, autoRefresh: { ...running.jobs.autoRefresh, status: 'running' } };
    rerender(
      <JobEventsContext.Provider value={running}>
        <ActivityPopover />
      </JobEventsContext.Provider>,
    );
    expect(button()).toHaveAccessibleName('Activity, 1 running or queued');
    expect(button()).toHaveTextContent('Activity1');
  });

  test('opens as a dialog named Activity, focused; with nothing going on, it says so', async () => {
    const user = userEvent.setup();
    renderPopover();
    await user.click(button());

    const dialog = screen.getByRole('dialog', { name: 'Activity' });
    expect(button()).toHaveAttribute('aria-expanded', 'true');
    expect(button()).toHaveAttribute('aria-controls', dialog.id);
    expect(within(dialog).getByRole('region', { name: 'Now' })).toHaveTextContent('Nothing running.');
    expect(within(dialog).queryByRole('region', { name: 'Problems' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('region', { name: 'Up next' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('region', { name: 'Just finished' })).not.toBeInTheDocument();
    expect(dialog).toHaveFocus();
  });

  test('Now: background jobs with their repos, and your requests, with how long each has run', async () => {
    const user = userEvent.setup();
    const startedAt = new Date(Date.now() - 40_000).toISOString();
    const events = jobEvents();
    events.jobs = {
      ...events.jobs,
      autoRefresh: { ...events.jobs.autoRefresh, status: 'running', startedAt, runningDetail: { repos: ['acme/api', 'acme/web'] } },
    };
    render(
      <JobEventsContext.Provider value={events}>
        <BackfillStatusContext.Provider value={backfill}>
          <RequestActivityDisplayContext.Provider
            value={{
              activeRequests: [{ key: 'olderMerged', label: 'Fetch older merged PRs', count: 1, startedAtMs: Date.now() - 125_000, thresholds: { warnMs: 600_000, criticalMs: 1_200_000 } }],
              recentRequestActivity: [],
            }}
          >
            <ActivityPopover />
          </RequestActivityDisplayContext.Provider>
        </BackfillStatusContext.Provider>
      </JobEventsContext.Provider>,
    );
    expect(button()).toHaveAccessibleName('Activity, 2 running or queued');
    await user.click(button());
    const items = within(screen.getByRole('region', { name: 'Now' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/^Full refreshacme\/api, acme\/webBackground4\ds$/);
    expect(items[1]).toHaveTextContent(/^Fetch older merged PRsYou2m$/);
  });

  test("the page's own data load isn't counted on the button, and shows under Now only once it's slow", async () => {
    const user = userEvent.setup();
    const dataLoad = (msAgo: number) => ({ key: 'dataLoad', label: 'Data refresh', count: 1, startedAtMs: Date.now() - msAgo, thresholds: { warnMs: 120_000, criticalMs: 360_000 } });
    const view = (msAgo: number) => (
      <JobEventsContext.Provider value={jobEvents()}>
        <BackfillStatusContext.Provider value={backfill}>
          <RequestActivityDisplayContext.Provider value={{ activeRequests: [dataLoad(msAgo)], recentRequestActivity: [] }}>
            <ActivityPopover />
          </RequestActivityDisplayContext.Provider>
        </BackfillStatusContext.Provider>
      </JobEventsContext.Provider>
    );
    const { rerender } = render(view(1_000));
    expect(button()).toHaveAccessibleName('Activity');
    await user.click(button());
    expect(screen.getByRole('region', { name: 'Now' })).toHaveTextContent('Nothing running.');

    rerender(view(8_000));
    expect(button()).toHaveAccessibleName('Activity');
    expect(screen.getByRole('region', { name: 'Now' })).toHaveTextContent(/^NowData refreshYou\ds$/);
  });

  test('a request running long says so to screen readers too', async () => {
    const user = userEvent.setup();
    render(
      <JobEventsContext.Provider value={jobEvents()}>
        <BackfillStatusContext.Provider value={backfill}>
          <RequestActivityDisplayContext.Provider
            value={{ activeRequests: [{ key: 'runScript', label: 'Run script', count: 1, startedAtMs: Date.now() - 7 * 60_000, thresholds: { warnMs: 120_000, criticalMs: 360_000 } }], recentRequestActivity: [] }}
          >
            <ActivityPopover />
          </RequestActivityDisplayContext.Provider>
        </BackfillStatusContext.Provider>
      </JobEventsContext.Provider>,
    );
    await user.click(button());
    expect(screen.getByRole('region', { name: 'Now' })).toHaveTextContent('7m, running much longer than usual');
  });

  test('Problems: backfill status that could not be read', async () => {
    const user = userEvent.setup();
    render(
      <JobEventsContext.Provider value={jobEvents()}>
        <BackfillStatusContext.Provider value={{ ...backfill, hasBackfillStatusError: true }}>
          <RequestActivityDisplayContext.Provider value={{ activeRequests: [], recentRequestActivity: [] }}>
            <ActivityPopover />
          </RequestActivityDisplayContext.Provider>
        </BackfillStatusContext.Provider>
      </JobEventsContext.Provider>,
    );
    expect(button()).toHaveAccessibleName('Activity, 1 problem');
    await user.click(button());
    expect(screen.getByRole('region', { name: 'Problems' })).toHaveTextContent("Backfill status couldn't be read.");
  });

  test('Problems: a paused repo can be reset from here, and the button turns red', async () => {
    const user = userEvent.setup();
    renderPopover(jobEvents({ openAutoCircuitRepos: ['acme/api'] }));
    expect(button()).toHaveAccessibleName('Activity, 1 problem');
    await user.click(button());
    const problems = screen.getByRole('region', { name: 'Problems' });
    expect(problems).toHaveTextContent('Paused after repeated failures: acme/api');
    await user.click(within(problems).getByRole('button', { name: 'Reset' }));
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  test('Up next: the queue in its order, with Run now for a scheduled task; Just finished, newest first', async () => {
    const user = userEvent.setup();
    renderPopover(
      jobEvents({
        dispatcherQueue: [
          { repo: 'acme/api', taskType: 'quickCheck', status: 'due', priority: 5 },
          { repo: 'acme/web', taskType: 'autoRefresh', status: 'scheduled', priority: 3, nextDueAt: new Date(Date.now() + 6.5 * 60_000).toISOString() },
        ],
        recentFinished: [
          { job: 'autoRefresh', at: new Date(Date.now() - 9 * 60_000).toISOString(), ok: false, detail: { error: 'gh auth expired' } },
          { job: 'quickCheck', at: new Date(Date.now() - 60_000).toISOString(), ok: true, detail: { reposCheckedCount: 2 } },
        ],
      }),
    );
    await user.click(button());
    const next = within(screen.getByRole('region', { name: 'Up next' })).getAllByRole('listitem');
    expect(next[0]).toHaveTextContent(/^Quick checkacme\/apidue now$/);
    expect(next[1]).toHaveTextContent(/^Full refreshacme\/webin 6mRun now$/);
    await user.click(within(next[1]!).getByRole('button', { name: 'Run full refresh for acme/web now' }));
    expect(mockBump).toHaveBeenCalledWith('acme/web', 'autoRefresh');

    const finished = within(screen.getByRole('region', { name: 'Just finished' })).getAllByRole('listitem');
    expect(finished[0]).toHaveTextContent(/Quick check.*2 repos.*1m ago/);
    expect(finished[1]).toHaveTextContent(/Full refresh failed.*gh auth expired.*9m ago/);
  });

  test("\"What these are\" explains each kind, and what it doesn't update; each item's name says it on hover", async () => {
    const user = userEvent.setup();
    renderPopover(jobEvents({ dispatcherQueue: [{ repo: 'acme/api', taskType: 'quickCheck', status: 'due', priority: 5 }] }));
    await user.click(button());
    const guide = screen.getByText('What these are').closest('details') as HTMLElement;
    expect(guide).not.toHaveAttribute('open');
    await user.click(screen.getByText('What these are'));
    expect(within(guide).getByText('Update changed PRs')).toBeVisible();
    expect(guide).toHaveTextContent(/Full refresh.*Doesn't update: PRs that look unchanged keep their stored details/);

    const label = within(screen.getByRole('region', { name: 'Up next' })).getByText('Quick check');
    expect(label.getAttribute('title')).toMatch(/^Every 5 minutes.*Doesn't update:.*\n\nPriority 5\./s);
  });

  test('Esc closes it and returns focus to the button; so does the close button', async () => {
    const user = userEvent.setup();
    renderPopover();

    await user.click(button());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button()).toHaveFocus();

    await user.click(button());
    await user.click(screen.getByRole('button', { name: 'Close activity' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(button()).toHaveFocus();
  });

  test('a click outside closes it; a click inside, or on its button again, acts normally', async () => {
    const user = userEvent.setup();
    renderPopover(jobEvents(), <button type="button">Elsewhere</button>);

    await user.click(button());
    await user.click(screen.getByRole('dialog', { name: 'Activity' }));
    expect(screen.getByRole('dialog', { name: 'Activity' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(button());
    await user.click(button());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('focus moving outside closes it; focus moving inside, or the window losing focus, does not', async () => {
    const user = userEvent.setup();
    renderPopover(jobEvents(), <button type="button">Settings</button>);
    await user.click(button());
    const dialog = screen.getByRole('dialog', { name: 'Activity' });

    // Into its close button, then out of the window: still open.
    act(() => screen.getByRole('button', { name: 'Close activity' }).focus());
    fireEvent.focusOut(screen.getByRole('button', { name: 'Close activity' }), { relatedTarget: null });
    expect(dialog).toBeInTheDocument();

    // Tab on to the next control after it.
    act(() => screen.getByRole('button', { name: 'Settings' }).focus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('the page scrolling closes it; scrolling its own content, or a list elsewhere, does not', async () => {
    const user = userEvent.setup();
    renderPopover(undefined, <div data-testid="list-elsewhere" />);
    await user.click(button());
    const dialog = screen.getByRole('dialog', { name: 'Activity' });

    fireEvent.scroll(dialog.querySelector('.activity-popover-content') as Element);
    fireEvent.scroll(screen.getByTestId('list-elsewhere'));
    expect(dialog).toBeInTheDocument();

    fireEvent.scroll(document);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('a container around the button scrolling closes it (the button moves)', async () => {
    const user = userEvent.setup();
    const { container } = renderPopover();
    await user.click(button());

    fireEvent.scroll(container);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('closed, it leaves no listeners behind', async () => {
    const user = userEvent.setup();
    const removeFromWindow = jest.spyOn(window, 'removeEventListener');
    const removeFromDocument = jest.spyOn(document, 'removeEventListener');
    renderPopover();
    await user.click(button());
    await user.keyboard('{Escape}');

    expect(removeFromWindow).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeFromDocument).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(removeFromDocument).toHaveBeenCalledWith('focusout', expect.any(Function));
    expect(removeFromWindow).toHaveBeenCalledWith('scroll', expect.any(Function), true);
    removeFromWindow.mockRestore();
    removeFromDocument.mockRestore();
  });
});
