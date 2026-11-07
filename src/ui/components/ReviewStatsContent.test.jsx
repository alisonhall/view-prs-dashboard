/** @jest-environment jsdom */

const React = require('react');
const { render, screen, waitFor, within } = require('@testing-library/react');
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
const { ReviewStatsProvider } = require('./ReviewStatsProvider');
const { ReviewStatsControls } = require('./ReviewStatsControls');
const { REVIEW_STATS_COLUMNS_STORAGE_KEY } = require('../helpers/review-stats-columns.helpers');
const { ActorIdentityContext, defaultActorIdentity } = require('../state/ActorIdentityContext');

// A stand-in for /view-prs/user-defaults: GET returns `savedDefaults`, PUT
// replaces it.
let savedDefaults;
const fetchMock = jest.fn(async (_input, init) => {
  if (init?.method === 'PUT') {
    savedDefaults = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({}) };
  }
  return { ok: true, json: async () => ({ overrides: { ...savedDefaults } }) };
});

beforeEach(() => {
  savedDefaults = {};
  fetchMock.mockClear();
  global.fetch = fetchMock;
  window.localStorage.clear();
});

// The Sources column starts hidden; these tests are about it.
const showSourcesColumn = () => {
  window.localStorage.setItem(REVIEW_STATS_COLUMNS_STORAGE_KEY, JSON.stringify({ sources: true }));
  savedDefaults = { reviewStatsColumns: { sources: true } };
};

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
    showSourcesColumn();
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
    showSourcesColumn();
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

  describe('when the table lists no one, its one row says why and offers a way out', () => {
    const emptyStats = (activeReviewers = []) => ({
      ...buildReviewStatsOverrides(buildStats({ reviewerRows: activeReviewers })),
      applyStatsControls: ({ summary }) => ({ summary, reviewerRows: [], totalBeforeLimit: 0 }),
    });
    const emptyRow = () => document.querySelector('.stats-table tbody tr.stats-table-empty');

    test('with a start date: no activity since then, and Clear dates clears both dates', async () => {
      const user = userEvent.setup();
      const setStatsViewState = jest.fn();
      renderContent(null, {
        reviewStatsOverrides: {
          ...emptyStats(),
          getNormalizedStatsDateRange: () => ({ startDate: '2026-08-06', endDate: '' }),
          setStatsViewState,
        },
      });

      expect(document.querySelectorAll('.stats-table tbody tr')).toHaveLength(1);
      expect(emptyRow()).toHaveTextContent('No reviewer activity since Aug 6, 2026.');
      // Reviewer and the 8 columns shown to start.
      expect(emptyRow().querySelector('td')).toHaveAttribute('colspan', '9');
      // The headings stay; the "Showing 0 of 0" note goes.
      expect(screen.getByRole('columnheader', { name: 'Reviewer' })).toBeInTheDocument();
      expect(screen.queryByText(/Showing 0 of 0/)).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Clear dates' }));
      expect(setStatsViewState).toHaveBeenCalledWith({ startDate: '', endDate: '' });
      // The button goes once the dates clear; focus lands on the table, not nowhere.
      expect(screen.getByRole('table', { name: 'Reviewers' })).toHaveFocus();
    });

    test('with both dates, or only an end date, it names the range', () => {
      const { unmount } = renderContent(null, {
        reviewStatsOverrides: {
          ...emptyStats(),
          getNormalizedStatsDateRange: () => ({ startDate: '2026-07-01', endDate: '2026-07-10' }),
        },
      });
      expect(emptyRow()).toHaveTextContent('No reviewer activity between Jul 1, 2026 and Jul 10, 2026.');
      unmount();

      renderContent(null, {
        reviewStatsOverrides: { ...emptyStats(), getNormalizedStatsDateRange: () => ({ startDate: '', endDate: '2026-07-10' }) },
      });
      expect(emptyRow()).toHaveTextContent('No reviewer activity up to Jul 10, 2026.');
    });

    test('with no dates, it says no one has reviewed yet, with no button', () => {
      renderContent(null, { reviewStatsOverrides: emptyStats() });

      expect(emptyRow()).toHaveTextContent("No reviewer activity yet: no one has commented on or reviewed someone else's PR.");
      expect(within(emptyRow()).queryByRole('button')).not.toBeInTheDocument();
    });

    test('when Show or Minimum comments hide active reviewers: says how many, and Show all reviewers resets both', async () => {
      const user = userEvent.setup();
      const setStatsViewState = jest.fn();
      const active = buildStats().reviewerRows;
      renderContent(null, {
        reviewStatsOverrides: {
          ...emptyStats(active),
          statsViewState: { filterMode: 'risky-only', minComments: 3 },
          getNormalizedStatsDateRange: () => ({ startDate: '2026-08-06', endDate: '' }),
          setStatsViewState,
        },
      });

      expect(emptyRow()).toHaveTextContent('No reviewers with risky approvals and at least 3 comments. 2 reviewers have activity since Aug 6, 2026.');
      expect(within(emptyRow()).queryByRole('button', { name: 'Clear dates' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Show all reviewers' }));
      expect(setStatsViewState).toHaveBeenCalledWith({ filterMode: 'all', minComments: 0 });
      expect(screen.getByRole('table', { name: 'Reviewers' })).toHaveFocus();
    });

    test('names only the control that hides them', () => {
      renderContent(null, {
        reviewStatsOverrides: { ...emptyStats(buildStats().reviewerRows.slice(0, 1)), statsViewState: { filterMode: 'all', minComments: 5 } },
      });
      expect(emptyRow()).toHaveTextContent('No reviewers with at least 5 comments. 1 reviewer has activity.');
    });

    test('with one comment the minimum, it says "comment"', () => {
      renderContent(null, {
        reviewStatsOverrides: { ...emptyStats(buildStats().reviewerRows), statsViewState: { filterMode: 'all', minComments: 1 } },
      });
      expect(emptyRow()).toHaveTextContent('No reviewers with at least 1 comment. 2 reviewers have activity.');
    });

    test('with the real Provider: Clear dates empties the Start date control and brings the reviewer back', async () => {
      const user = userEvent.setup();
      const payload = {
        byPrNumber: {
          7: {
            prNumber: '7',
            data: {
              number: '7',
              title: 'Old PR',
              authorLogin: 'author',
              reviews: [{ authorLogin: 'reviewer', state: 'APPROVED', submittedAt: '2020-01-02T00:00:00Z' }],
            },
          },
        },
      };
      render(
        <TabStateContext.Provider value={{ activeDataTab: 'review-stats', setActiveDataTab: () => {} }}>
          <PrDataProvider
            initialPayload={payload}
            initialStatsViewState={{ sortBy: 'reviews', filterMode: 'all', topN: 12, minComments: 0, startDate: '2026-08-06', endDate: '' }}
          >
            <ReviewStatsProvider>
              <ReviewStatsControls />
              <ReviewStatsContent />
            </ReviewStatsProvider>
          </PrDataProvider>
        </TabStateContext.Provider>,
      );

      expect(emptyRow()).toHaveTextContent('No reviewer activity since Aug 6, 2026.');
      await user.click(screen.getByRole('button', { name: 'Clear dates' }));

      expect(screen.getByLabelText('Start date')).toHaveValue('');
      expect(emptyRow()).toBeNull();
      expect(screen.getByText(/Showing 1 of 1 reviewers/)).toBeInTheDocument();
    });
  });

  describe('the table: its columns, the Columns menu and the reviewer cell', () => {
    const headings = () => screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    const columnsBox = (name) => screen.getByRole('checkbox', { name });

    test('starts without Thread comments, Resolved thread comments and Sources; Reviewer always shows', () => {
      renderContent(buildStats());

      expect(headings()).toEqual([
        'Reviewer',
        'Comments',
        'Reviews',
        'Approvals',
        'Risky approvals',
        'High-risk approvals',
        'Useful comment signals',
        'Comments → author commit',
        'PRs touched',
      ]);
      const menu = screen.getByRole('group', { name: 'Columns' });
      expect(within(menu).queryByRole('checkbox', { name: 'Reviewer' })).not.toBeInTheDocument();
      expect(columnsBox('Thread comments')).not.toBeChecked();
      expect(columnsBox('Comments')).toBeChecked();
      // Each row's cells line up with the headings.
      const alexRow = screen.getByRole('rowheader', { name: /Alex/ }).closest('tr');
      expect(alexRow.children).toHaveLength(9);
    });

    test('a column ticked in the menu shows, in its place, and the choice is saved in user-defaults.json and the browser copy', async () => {
      const user = userEvent.setup();
      savedDefaults = { repo: 'owner/repo' };
      renderContent(buildStats());
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());

      await user.click(columnsBox('Thread comments'));
      await user.click(columnsBox('PRs touched'));

      expect(headings().slice(0, 3)).toEqual(['Reviewer', 'Comments', 'Thread comments']);
      expect(headings()).not.toContain('PRs touched');
      await waitFor(() => expect(savedDefaults.reviewStatsColumns).toEqual({ threadComments: true, prCount: false }));
      expect(savedDefaults.repo).toBe('owner/repo');
      expect(JSON.parse(window.localStorage.getItem(REVIEW_STATS_COLUMNS_STORAGE_KEY))).toEqual({ threadComments: true, prCount: false });

      // Back to the defaults: nothing left to save.
      await user.click(columnsBox('Thread comments'));
      await user.click(columnsBox('PRs touched'));
      await waitFor(() => expect(savedDefaults).not.toHaveProperty('reviewStatsColumns'));
    });

    test('the choices saved in user-defaults.json apply once read, over the browser copy', async () => {
      window.localStorage.setItem(REVIEW_STATS_COLUMNS_STORAGE_KEY, JSON.stringify({ threadComments: true }));
      savedDefaults = { reviewStatsColumns: { sources: true, comments: false, unknown: true } };
      renderContent(buildStats());

      // The browser copy draws first...
      expect(headings()).toContain('Thread comments');
      // ...then the saved choices take over.
      await waitFor(() => expect(headings()).toContain('Sources'));
      expect(headings()).not.toContain('Thread comments');
      expect(headings()).not.toContain('Comments');
    });

    test('hiding Sources while a reviewer\'s sources are open hides them too', async () => {
      const user = userEvent.setup();
      showSourcesColumn();
      renderContent(buildStats());
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());

      await user.click(screen.getByRole('button', { name: 'Show sources' }));
      const sourcesRow = document.querySelector('.stats-sources-row:not([hidden])');
      expect(sourcesRow).not.toBeNull();
      await user.click(columnsBox('Sources'));
      expect(sourcesRow).toHaveAttribute('hidden');
    });

    test('each reviewer is a row header with an avatar, the display name, and the login on hover', () => {
      const stats = buildStats();
      stats.reviewerRows[0] = { ...stats.reviewerRows[0], login: 'alex-k', name: 'Alex Kim' };
      renderContent(stats);

      const header = screen.getByRole('rowheader', { name: 'Alex Kim' });
      expect(header.querySelector('.ui-avatar')).toHaveTextContent('AK');
      expect(header.querySelector('.stats-reviewer')).toHaveAttribute('title', 'alex-k');
    });

    test('the viewer is marked "(you)" with the avatar ring', () => {
      const stats = buildStats();
      stats.reviewerRows[0] = { ...stats.reviewerRows[0], login: 'me', name: 'Me Myself' };
      render(
        <TabStateContext.Provider value={{ activeDataTab: 'review-stats', setActiveDataTab: () => {} }}>
          <PrDataProvider initialPayload={{ byPrNumber: { 1: {} } }}>
            {/* Inside PrDataProvider, which provides its own. */}
            <ActorIdentityContext.Provider value={{ ...defaultActorIdentity, getEffectiveViewerLogin: () => 'me' }}>
              <ReviewStatsContext.Provider value={{ ...defaultReviewStats, ...buildReviewStatsOverrides(stats) }}>
                <ReviewStatsContent />
              </ReviewStatsContext.Provider>
            </ActorIdentityContext.Provider>
          </PrDataProvider>
        </TabStateContext.Provider>,
      );

      const header = screen.getByRole('rowheader', { name: /Me Myself/ });
      expect(header).toHaveTextContent('Me Myself (you)');
      expect(header.querySelector('.ui-avatar')).toHaveAttribute('data-viewer', 'true');
    });

    test('the table sits in a box that scrolls sideways', () => {
      renderContent(buildStats());
      expect(screen.getByRole('table', { name: 'Reviewers' }).parentElement).toHaveClass('stats-table-scroll');
    });
  });
});
