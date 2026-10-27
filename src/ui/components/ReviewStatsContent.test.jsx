/** @jest-environment jsdom */

const React = require('react');
const { render, screen } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
require('@testing-library/jest-dom');
const { ReviewStatsContent } = require('./ReviewStatsContent');
const { PrDataProvider } = require('../state/PrDataProvider');
const { createPrDataProbe } = require('../test-fixtures/pr-data-probe');
// Test-only bridge removal (see WINDOW_BRIDGE_ELIMINATION_PLAN.md): reads and
// writes PrDataProvider through this probe, not window.* bridges.
const prDataProbe = createPrDataProbe();
const { ReviewStatsContext, defaultReviewStats } = require('../state/ReviewStatsContext');
const { TabStateContext } = require('../state/TabStateContext');

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

// ReviewStatsContent computes `stats` itself via useReviewStats()'s
// buildReviewerStats/applyStatsControls (Phase 7, sub-phase 7.0 - see
// REACT_MIGRATION_PLAN.md) - these mocks stand in for the real aggregation
// helpers via a static Context value, matching how the real
// ReviewStatsProvider DI's them with the live statsViewState (irrelevant
// here since these are stubbed directly).
const buildReviewStatsOverrides = (stats) => ({
  buildReviewerStats: () => ({ summary: stats?.summary, reviewerRows: stats?.reviewerRows }),
  applyStatsControls: ({ summary, reviewerRows }) => ({
    summary,
    reviewerRows,
    totalBeforeLimit: stats?.totalBeforeLimit,
  }),
  getNormalizedStatsDateRange: () => ({ startDate: '', endDate: '' }),
  renderActivityTrendNote: () => 'Total reviewer activity: 5 events across 3 days.',
});

// Phase H.21 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 3): useIsTabPanelVisible() (what ReviewStatsContent calls under
// the hood) now reads TabStateContext instead of a panel element's
// `hidden` DOM attribute - defaults to "review-stats is the active tab"
// here, matching the OLD default (no #tab-panel-review-stats element in
// the DOM at all -> that hook's own prior "no matching panel = default
// visible" fallback), so every test below this that isn't specifically
// about tab-visibility gating keeps seeing real content, not the empty
// "no filtered rows" fallback. The gating describe block further down
// supplies its own, more specific TabStateContext.Provider instead.
const renderContent = (stats, { hasRows = true, reviewStatsOverrides } = {}) =>
  render(
    <TabStateContext.Provider
      value={{
        activeDataTab: 'review-stats',
        setActiveDataTab: () => {},
      }}
    >
      <PrDataProvider initialPayload={{ byPrNumber: hasRows ? { 1: {} } : {} }}>
        <prDataProbe.PrDataProbe />
        <ReviewStatsContext.Provider
          value={{ ...defaultReviewStats, ...buildReviewStatsOverrides(stats), ...reviewStatsOverrides }}
        >
          <ReviewStatsContent />
        </ReviewStatsContext.Provider>
      </PrDataProvider>
    </TabStateContext.Provider>,
  );

describe('ReviewStatsContent', () => {
  test('given no local rows, when rendering, then the empty message is shown instead of cards/table', () => {
    renderContent(null, { hasRows: false });

    expect(screen.getByText('No filtered rows available for review statistics.')).toBeInTheDocument();
    expect(document.querySelectorAll('.stat-card')).toHaveLength(0);
  });

  test('given reviewer stats, when rendering, then four cards and one table row per reviewer render', () => {
    renderContent(buildStats());

    expect(document.querySelectorAll('.stat-card')).toHaveLength(4);
    expect(document.querySelectorAll('.stats-table tbody tr')).toHaveLength(4); // 2 reviewers x (row + sources row)
    expect(screen.getByText(/Showing 2 of 2 reviewers/)).toBeInTheDocument();
    expect(screen.getByText(/Total reviewer activity: 5 events/)).toBeInTheDocument();
  });

  // Accessibility naming: each stat card is a group named by its label.
  test('given reviewer stats, when rendering, then each of the four cards is a group named by its label', () => {
    renderContent(buildStats());

    for (const name of ['Filtered rows', "Comments on others' PRs", 'Approvals', 'Comment usefulness']) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument();
    }
  });

  test('given a date range, when rendering, then the summary note includes it', () => {
    renderContent(buildStats(), {
      reviewStatsOverrides: {
        getNormalizedStatsDateRange: () => ({ startDate: '2026-07-01', endDate: '2026-07-10' }),
      },
    });

    expect(screen.getByText(/Date range: 2026-07-01 to 2026-07-10/)).toBeInTheDocument();
  });

  test('given a reviewer with sources, when clicking "Show sources", then the sources row becomes visible', async () => {
    const user = userEvent.setup();
    renderContent(buildStats());

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
    renderContent(buildStats());

    const rows = document.querySelectorAll('.stats-table tbody tr:not(.stats-sources-row)');
    const jamieRow = Array.from(rows).find((row) => row.textContent.includes('Jamie'));
    expect(jamieRow.querySelector('.stats-sources-cell').textContent).toBe('-');
  });

  // Phase H.16 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
  // cluster 2): window.navigateToPrInTableFromStats is deleted -
  // SourceItemRow now calls useNavigateToPrInTable() directly, which
  // dispatches 'pr-navigate-to-insights' instead of a window.* bridge.
  test('given a card with sources, when opening its "Show sources" details, then clicking "View in table" dispatches pr-navigate-to-insights', async () => {
    const user = userEvent.setup();
    const events = [];
    const handler = (event) => events.push(event.detail);
    window.addEventListener('pr-navigate-to-insights', handler);
    renderContent(buildStats());

    const filteredRowsCard = screen.getByText('Filtered rows').closest('.stat-card');
    await user.click(filteredRowsCard.querySelector('summary'));
    await user.click(filteredRowsCard.querySelector('.author-insights-table-link'));

    expect(events).toEqual([{ prNumber: '101', repo: '', focusUnsaved: false }]);
    window.removeEventListener('pr-navigate-to-insights', handler);
  });

  test('given reviewer stats with comments/approvals, when rendering, then the chart visuals (StatsVisuals) actually render', () => {
    renderContent(buildStats());

    // Alex has comments/approvals/usefulness signals; Jamie has none - so
    // the "top reviewers by ..." cards render (real integration through to
    // StatsVisuals/GraphCard, not a stubbed bridge).
    expect(screen.getByText('Top reviewers by comments')).toBeInTheDocument();
    expect(screen.getByText('Top reviewers by approvals')).toBeInTheDocument();
  });

  describe('tab-visibility gating (deferred-items follow-up, item 3 - see REACT_MIGRATION_PLAN.md)', () => {
    // Phase H.21 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
    // cluster 3): useIsTabPanelVisible() (what ReviewStatsContent calls
    // under the hood) now reads TabStateContext's activeDataTab instead of
    // a panel element's `hidden` DOM attribute - seed/change that Context
    // value directly instead of creating a #tab-panel-review-stats element
    // and flipping its `hidden` property.
    const renderWithActiveDataTab = (activeDataTab, children) =>
      render(
        <TabStateContext.Provider value={{ activeDataTab }}>
          {children}
        </TabStateContext.Provider>,
      );

    test('given a hidden review-stats panel, when the payload changes, then the expensive stats recompute is skipped', () => {
      const stats = buildStats();
      const buildReviewerStatsSpy = jest.fn(() => ({ summary: stats.summary, reviewerRows: stats.reviewerRows }));

      renderWithActiveDataTab(
        'pr-data',
        <PrDataProvider initialPayload={{ byPrNumber: { 1: {} } }}>
          <prDataProbe.PrDataProbe />
          <ReviewStatsContext.Provider
            value={{
              ...defaultReviewStats,
              buildReviewerStats: buildReviewerStatsSpy,
              applyStatsControls: ({ summary, reviewerRows }) => ({ summary, reviewerRows, totalBeforeLimit: stats.totalBeforeLimit }),
            }}
          >
            <ReviewStatsContent />
          </ReviewStatsContext.Provider>
        </PrDataProvider>,
      );

      // Never visible, so never computed even once - the empty message
      // shows rather than stale/real data.
      expect(screen.getByText('No filtered rows available for review statistics.')).toBeInTheDocument();
      expect(buildReviewerStatsSpy).not.toHaveBeenCalled();

      const nextPayload = { byPrNumber: { 1: {}, 2: {} } };
      React.act(() => {
        prDataProbe.applyFreshTablePayload(nextPayload);
      });

      // Guard against a vacuous pass: the update really landed.
      expect(prDataProbe.readPayload()).toBe(nextPayload);
      expect(buildReviewerStatsSpy).not.toHaveBeenCalled();
      expect(screen.getByText('No filtered rows available for review statistics.')).toBeInTheDocument();
    });

    test('given a review-stats panel that becomes visible, when the active data tab changes, then the stats recompute immediately from the latest payload', async () => {
      const stats = buildStats();
      const buildReviewerStatsSpy = jest.fn(() => ({ summary: stats.summary, reviewerRows: stats.reviewerRows }));

      const tree = (
        <PrDataProvider initialPayload={{ byPrNumber: { 1: {} } }}>
          <prDataProbe.PrDataProbe />
          <ReviewStatsContext.Provider
            value={{
              ...defaultReviewStats,
              buildReviewerStats: buildReviewerStatsSpy,
              applyStatsControls: ({ summary, reviewerRows }) => ({ summary, reviewerRows, totalBeforeLimit: stats.totalBeforeLimit }),
            }}
          >
            <ReviewStatsContent />
          </ReviewStatsContext.Provider>
        </PrDataProvider>
      );
      const { rerender } = renderWithActiveDataTab('pr-data', tree);
      expect(buildReviewerStatsSpy).not.toHaveBeenCalled();

      // Simulate clicking the "Review Stats" data tab button - setActiveDataTab
      // (TabStateProvider.tsx) - by changing the Context value that drives
      // it, instead of flipping the panel's own `hidden` attribute directly.
      await React.act(async () => {
        rerender(
          <TabStateContext.Provider value={{ activeDataTab: 'review-stats' }}>
            {tree}
          </TabStateContext.Provider>,
        );
        await Promise.resolve();
      });

      expect(buildReviewerStatsSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Showing 2 of 2 reviewers/)).toBeInTheDocument();
    });
  });
});
