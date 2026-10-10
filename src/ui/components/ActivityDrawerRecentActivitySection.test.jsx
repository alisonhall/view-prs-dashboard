/** @jest-environment jsdom */

const { render, screen } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { JobEventsContext } = require('../state/JobEventsContext');
const { ActivityDrawerRecentActivitySection } = require('./ActivityDrawerRecentActivitySection');

const renderWithRecentFinished = (recentFinished, recentRequestActivity) =>
  render(
    <JobEventsContext.Provider value={{ recentFinished }}>
      <ActivityDrawerRecentActivitySection recentRequestActivity={recentRequestActivity} />
    </JobEventsContext.Provider>,
  );

describe('ActivityDrawerRecentActivitySection', () => {
  test('renders nothing when both lists are empty', () => {
    const { container } = renderWithRecentFinished([], []);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when recentFinished is missing from context entirely (defensive default)', () => {
    const { container } = render(
      <JobEventsContext.Provider value={{}}>
        <ActivityDrawerRecentActivitySection recentRequestActivity={[]} />
      </JobEventsContext.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('shows a scheduled-job entry with its ok/error outcome and timestamp', () => {
    renderWithRecentFinished(
      [{ job: 'autoRefresh', at: '2026-01-01T00:00:00.000Z', ok: true, detail: {} }],
      [],
    );

    expect(screen.getByText('Scheduled jobs')).toBeInTheDocument();
    expect(screen.getByText(/Auto refresh — ok/)).toBeInTheDocument();
  });

  test('shows a failed scheduled job distinctly from a successful one', () => {
    renderWithRecentFinished(
      [
        { job: 'quickCheck', at: '2026-01-01T00:01:00.000Z', ok: false, detail: { error: 'boom' } },
        { job: 'autoRefresh', at: '2026-01-01T00:00:00.000Z', ok: true, detail: {} },
      ],
      [],
    );

    const failedItem = screen.getByText(/Quick check — failed/);
    expect(failedItem).toBeInTheDocument();
    expect(failedItem).toHaveClass('is-failed');
    const okItem = screen.getByText(/Auto refresh — ok/);
    expect(okItem).not.toHaveClass('is-failed');
  });

  test('shows recent this-tab user actions in their own group', () => {
    renderWithRecentFinished(
      [],
      [{ key: 'labelApply', label: 'Apply label', finishedAt: '2026-01-01T00:00:00.000Z' }],
    );

    expect(screen.getByText('Actions from this tab')).toBeInTheDocument();
    expect(screen.getByText(/Apply label/)).toBeInTheDocument();
  });

  test('caps the displayed list at 5 entries even if more are tracked', () => {
    const manyEntries = Array.from({ length: 10 }, (_, index) => ({
      key: 'labelApply',
      label: `Apply label #${index}`,
      finishedAt: '2026-01-01T00:00:00.000Z',
    }));
    renderWithRecentFinished([], manyEntries);

    expect(screen.getAllByText(/Apply label #/)).toHaveLength(5);
  });

  test('shows both groups together when both have entries', () => {
    renderWithRecentFinished(
      [{ job: 'mergedQueueDrain', at: '2026-01-01T00:00:00.000Z', ok: true, detail: {} }],
      [{ key: 'notesSave', label: 'Notes save', finishedAt: '2026-01-01T00:00:00.000Z' }],
    );

    expect(screen.getByText('Scheduled jobs')).toBeInTheDocument();
    expect(screen.getByText('Actions from this tab')).toBeInTheDocument();
  });
});
