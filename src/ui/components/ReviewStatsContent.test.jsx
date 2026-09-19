/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ReviewStatsContent } = require('./ReviewStatsContent');

const buildStats = (overrides = {}) => ({
  summary: {
    rows: 2,
    commentsOnOthersPrs: 4,
    approvals: 3,
    riskyApprovals: 1,
    highRiskApprovals: 0,
    usefulnessSignals: 2,
    commentsFollowedByAuthorCommit: 1,
    sources: {
      rows: [{ prNumber: 101, prTitle: 'Alpha', prAuthor: 'octocat' }],
      commentsOnOthersPrs: [{ reviewer: 'Alex', count: 2 }],
      approvals: [{ reviewer: 'Alex', approvedAt: '2026-07-01T10:00:00Z' }],
      usefulnessSignals: [{ reviewer: 'Alex', count: 1 }],
    },
  },
  reviewerRows: [
    {
      name: 'Alex',
      comments: 2,
      threadComments: 1,
      reviews: 3,
      approvals: 2,
      riskyApprovals: 1,
      highRiskApprovals: 0,
      usefulnessSignals: 1,
      commentsFollowedByAuthorCommit: 1,
      resolvedThreadComments: 1,
      prCount: 2,
      sources: {
        comments: [{ prNumber: 101, prTitle: 'Alpha', count: 2 }],
        reviews: [],
        riskyApprovals: [],
        usefulnessSignals: [],
      },
    },
    {
      name: 'Jamie',
      comments: 0,
      threadComments: 0,
      reviews: 0,
      approvals: 0,
      riskyApprovals: 0,
      highRiskApprovals: 0,
      usefulnessSignals: 0,
      commentsFollowedByAuthorCommit: 0,
      resolvedThreadComments: 0,
      prCount: 0,
      sources: { comments: [], reviews: [], riskyApprovals: [], usefulnessSignals: [] },
    },
  ],
  totalBeforeLimit: 2,
  ...overrides,
});

describe('ReviewStatsContent', () => {
  beforeEach(() => {
    window.reviewStatsFormatIsoDatetime = (value) => String(value || '-');
    window.getNormalizedStatsDateRange = () => ({ startDate: '', endDate: '' });
    window.renderActivityTrendNote = () => 'Total reviewer activity: 5 events across 3 days.';
    window.navigateToPrInTableFromStats = jest.fn();
  });

  afterEach(() => {
    delete window.reviewStatsFormatIsoDatetime;
    delete window.getNormalizedStatsDateRange;
    delete window.renderActivityTrendNote;
    delete window.navigateToPrInTableFromStats;
  });

  test('given stats is null, when rendering, then the empty message is shown instead of cards/table', () => {
    render(<ReviewStatsContent stats={null} rows={[]} actorsMap={{}} />);

    expect(screen.getByText('No filtered rows available for review statistics.')).toBeInTheDocument();
    expect(document.querySelectorAll('.stat-card')).toHaveLength(0);
  });

  test('given reviewer stats, when rendering, then four cards and one table row per reviewer render', () => {
    render(<ReviewStatsContent stats={buildStats()} rows={[]} actorsMap={{}} />);

    expect(document.querySelectorAll('.stat-card')).toHaveLength(4);
    expect(document.querySelectorAll('.stats-table tbody tr')).toHaveLength(4); // 2 reviewers x (row + sources row)
    expect(screen.getByText(/Showing 2 of 2 reviewers/)).toBeInTheDocument();
    expect(screen.getByText(/Total reviewer activity: 5 events/)).toBeInTheDocument();
  });

  test('given a date range, when rendering, then the summary note includes it', () => {
    window.getNormalizedStatsDateRange = () => ({ startDate: '2026-07-01', endDate: '2026-07-10' });
    render(<ReviewStatsContent stats={buildStats()} rows={[]} actorsMap={{}} />);

    expect(screen.getByText(/Date range: 2026-07-01 to 2026-07-10/)).toBeInTheDocument();
  });

  test('given a reviewer with sources, when clicking "Show sources", then the sources row becomes visible', async () => {
    const user = userEvent.setup();
    render(<ReviewStatsContent stats={buildStats()} rows={[]} actorsMap={{}} />);

    const toggleButtons = screen.getAllByRole('button', { name: 'Show sources' });
    // Alex has comment sources; Jamie has none and gets "-" instead of a button.
    expect(toggleButtons).toHaveLength(1);

    await user.click(toggleButtons[0]);

    const hideButton = screen.getByRole('button', { name: 'Hide sources' });
    expect(hideButton).toHaveAttribute('aria-expanded', 'true');
    const sourcesRow = hideButton.closest('tr').nextElementSibling;
    expect(sourcesRow).not.toHaveAttribute('hidden');
    expect(sourcesRow.textContent).toContain('2 comments');
  });

  test('given a reviewer with no sources, when rendering, then its sources cell shows "-" with no button', () => {
    render(<ReviewStatsContent stats={buildStats()} rows={[]} actorsMap={{}} />);

    const rows = document.querySelectorAll('.stats-table tbody tr:not(.stats-sources-row)');
    const jamieRow = Array.from(rows).find((row) => row.textContent.includes('Jamie'));
    expect(jamieRow.querySelector('.stats-sources-cell').textContent).toBe('-');
  });

  test('given a card with sources, when opening its "Show sources" details, then clicking "View in table" calls the navigation bridge', async () => {
    const user = userEvent.setup();
    render(<ReviewStatsContent stats={buildStats()} rows={[]} actorsMap={{}} />);

    const filteredRowsCard = screen.getByText('Filtered rows').closest('.stat-card');
    await user.click(filteredRowsCard.querySelector('summary'));
    await user.click(filteredRowsCard.querySelector('.author-insights-table-link'));

    expect(window.navigateToPrInTableFromStats).toHaveBeenCalledWith('101');
  });

  test('given reviewer stats with comments/approvals, when rendering, then the chart visuals (StatsVisuals) actually render', () => {
    render(<ReviewStatsContent stats={buildStats()} rows={[]} actorsMap={{}} />);

    // Alex has comments/approvals/usefulness signals; Jamie has none - so
    // the "top reviewers by ..." cards render (real integration through to
    // StatsVisuals/GraphCard, not a stubbed bridge).
    expect(screen.getByText('Top reviewers by comments')).toBeInTheDocument();
    expect(screen.getByText('Top reviewers by approvals')).toBeInTheDocument();
  });
});
