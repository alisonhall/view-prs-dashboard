/** @jest-environment jsdom */

const { render, screen, fireEvent, waitFor } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { JobEventsContext } = require('../state/JobEventsContext');
const { ActivityDrawerDispatcherSection } = require('./ActivityDrawerDispatcherSection');

const renderWithQueue = (dispatcherQueue, props = {}) =>
  render(
    <JobEventsContext.Provider value={{ dispatcherQueue }}>
      <ActivityDrawerDispatcherSection {...props} />
    </JobEventsContext.Provider>,
  );

describe('ActivityDrawerDispatcherSection', () => {
  test('renders nothing when the dispatcher queue is empty', () => {
    const { container } = renderWithQueue([]);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when dispatcherQueue is missing from context entirely (defensive default)', () => {
    const { container } = render(
      <JobEventsContext.Provider value={{}}>
        <ActivityDrawerDispatcherSection />
      </JobEventsContext.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders one entry per queue item with repo, task label, priority, and status', () => {
    renderWithQueue([
      {
        repo: 'owner/repoA',
        taskType: 'autoRefresh',
        priority: 3,
        status: 'running',
        nextDueAt: '2026-01-01T00:00:00.000Z',
        intervalMs: 900000,
        lastFinishedAt: null,
        lastOk: null,
      },
    ]);

    expect(screen.getByText('Dispatcher queue')).toBeInTheDocument();
    expect(screen.getByText('owner/repoA')).toBeInTheDocument();
    expect(screen.getByText('Auto refresh')).toBeInTheDocument();
    expect(screen.getByText('priority 3')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  test('explains what priority and each status word mean via tooltips', () => {
    renderWithQueue([
      {
        repo: 'owner/repoA',
        taskType: 'autoRefresh',
        priority: 3,
        status: 'due',
        nextDueAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(screen.getByText('priority 3')).toHaveAttribute(
      'title',
      expect.stringContaining('ranks which task wins'),
    );
    expect(screen.getByText('due')).toHaveAttribute(
      'title',
      expect.stringContaining('waiting for a free slot'),
    );
    expect(
      screen.getByText('Priority: higher number runs first when multiple tasks are due at the same time.'),
    ).toBeInTheDocument();
  });

  test('offers a "Run now" button only for scheduled entries, and calls onBump with repo/taskType', async () => {
    const onBump = jest.fn().mockResolvedValue(true);
    renderWithQueue(
      [
        {
          repo: 'owner/repoA',
          taskType: 'mergedDrain',
          priority: 1,
          status: 'scheduled',
          nextDueAt: '2026-01-01T00:05:00.000Z',
        },
        {
          repo: 'owner/repoB',
          taskType: 'autoRefresh',
          priority: 3,
          status: 'due',
          nextDueAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      { onBump },
    );

    const buttons = screen.getAllByRole('button', { name: 'Run now' });
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]);
    expect(onBump).toHaveBeenCalledWith('owner/repoA', 'mergedDrain');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run now' })).not.toBeDisabled());
  });

  test('disables the "Run now" button while a bump request is in flight', async () => {
    let resolveBump;
    const onBump = jest.fn(() => new Promise((resolve) => { resolveBump = resolve; }));
    renderWithQueue(
      [
        {
          repo: 'owner/repoA',
          taskType: 'mergedDrain',
          priority: 1,
          status: 'scheduled',
          nextDueAt: '2026-01-01T00:05:00.000Z',
        },
      ],
      { onBump },
    );

    const button = screen.getByRole('button', { name: 'Run now' });
    fireEvent.click(button);

    expect(screen.getByRole('button', { name: 'Requesting…' })).toBeDisabled();

    resolveBump(true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run now' })).not.toBeDisabled());
  });

  test('does not warn about updating state on an unmounted component when the drawer closes mid-request', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let resolveBump;
    const onBump = jest.fn(() => new Promise((resolve) => { resolveBump = resolve; }));
    const { unmount } = renderWithQueue(
      [
        {
          repo: 'owner/repoA',
          taskType: 'mergedDrain',
          priority: 1,
          status: 'scheduled',
          nextDueAt: '2026-01-01T00:05:00.000Z',
        },
      ],
      { onBump },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Run now' }));
    unmount();
    resolveBump(true);
    await waitFor(() => expect(onBump).toHaveBeenCalled());

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('unmounted component'),
      expect.anything(),
    );
    consoleErrorSpy.mockRestore();
  });

  test('does not render a "Run now" button when onBump is not provided', () => {
    renderWithQueue([
      {
        repo: 'owner/repoA',
        taskType: 'mergedDrain',
        priority: 1,
        status: 'scheduled',
        nextDueAt: '2026-01-01T00:05:00.000Z',
      },
    ]);

    expect(screen.queryByRole('button', { name: 'Run now' })).not.toBeInTheDocument();
  });

  test('applies the is-{status} class per entry', () => {
    renderWithQueue([
      {
        repo: 'owner/repoA',
        taskType: 'quickCheck',
        priority: 5,
        status: 'due',
        nextDueAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const item = screen.getByRole('listitem');
    expect(item).toHaveClass('is-due');
  });

  test('shows a due time only for scheduled (not-yet-due) entries', () => {
    renderWithQueue([
      {
        repo: 'owner/repoA',
        taskType: 'mergedDrain',
        priority: 1,
        status: 'scheduled',
        nextDueAt: '2026-01-01T00:05:00.000Z',
      },
      {
        repo: 'owner/repoB',
        taskType: 'autoRefresh',
        priority: 3,
        status: 'running',
        nextDueAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toMatch(/due/);
    expect(items[1].textContent).not.toMatch(/due/);
  });

  test('trusts the given order and does not re-sort entries itself', () => {
    renderWithQueue([
      { repo: 'owner/repoZ', taskType: 'quickCheck', priority: 1, status: 'due', nextDueAt: '2026-01-01T00:00:00.000Z' },
      { repo: 'owner/repoA', taskType: 'quickCheck', priority: 9, status: 'due', nextDueAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const items = screen.getAllByRole('listitem');
    expect(items[0].textContent).toMatch(/owner\/repoZ/);
    expect(items[1].textContent).toMatch(/owner\/repoA/);
  });
});
