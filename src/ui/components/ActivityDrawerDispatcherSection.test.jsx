/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { JobEventsContext } = require('../state/JobEventsContext');
const { ActivityDrawerDispatcherSection } = require('./ActivityDrawerDispatcherSection');

const renderWithQueue = (dispatcherQueue) =>
  render(
    <JobEventsContext.Provider value={{ dispatcherQueue }}>
      <ActivityDrawerDispatcherSection />
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
    expect(screen.getByText('p3')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
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
