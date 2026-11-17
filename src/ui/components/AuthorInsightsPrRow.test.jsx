/** @jest-environment jsdom */

const { render, screen, within } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { AuthorInsightsPrRow } = require('./AuthorInsightsPrRow');
const { TabStateContext } = require('../state/TabStateContext');

const buildEntry = (data = {}, extra = {}) => ({
  prNumber: '7',
  repo: 'owner/repo',
  ...extra,
  data: {
    number: '7',
    title: 'Fix the thing',
    url: 'https://github.com/owner/repo/pull/7',
    status: 'NO_CHANGE',
    approved: 'NO',
    approvalCount: 0,
    sourceUpdatedAt: '2026-11-01T10:00:00Z',
    ...data,
  },
});

let tabState;
const renderRow = (entry, activeDataTab = 'author-insights') => {
  tabState = {
    activeDataTab,
    setActiveDataTab: jest.fn(),
    returnTarget: null,
    rememberReturnTarget: jest.fn(),
    forgetReturnTarget: jest.fn(),
    returnToPreviousView: jest.fn(),
  };
  return render(
    <TabStateContext.Provider value={tabState}>
      <AuthorInsightsPrRow entry={entry} />
    </TabStateContext.Provider>,
  );
};

// The signals' tooltips, in order (each signal's data-tip).
const signalTips = () => [...screen.getByRole('group', { name: 'Signals' }).querySelectorAll('.ui-signal')].map((el) => el.getAttribute('data-tip'));

describe('AuthorInsightsPrRow', () => {
  test("first line: the PR's state, its number and title linking to GitHub, and when it was last updated", () => {
    renderRow(buildEntry());

    expect(screen.getByRole('img', { name: 'Open' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '#7 Fix the thing' });
    expect(link).toHaveAttribute('href', 'https://github.com/owner/repo/pull/7');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByText(/^Updated /)).toBeInTheDocument();
  });

  test('merged, closed and draft PRs say so, with when they were merged or closed', () => {
    const { unmount } = renderRow(buildEntry({ mergedAt: '2026-11-02T10:00:00Z' }));
    expect(screen.getByRole('img', { name: 'Merged' })).toBeInTheDocument();
    expect(screen.getByText(/^Merged /)).toBeInTheDocument();
    unmount();

    const closed = renderRow(buildEntry({ closedAt: '2026-11-02T10:00:00Z' }));
    expect(screen.getByRole('img', { name: 'Closed' })).toBeInTheDocument();
    expect(screen.getByText(/^Closed /)).toBeInTheDocument();
    closed.unmount();

    renderRow(buildEntry({}, { section: 'draft' }));
    expect(screen.getByRole('img', { name: 'Draft' })).toBeInTheDocument();
  });

  test("second line: the table's signals as one group - status, approvals, checks, conversations, viewed files - each with its tooltip", () => {
    renderRow(
      buildEntry({
        status: 'CHANGED',
        approved: 'YES',
        approvalCount: 2,
        checkState: 'FAIL',
        openConversationCount: 3,
        viewedFilesCount: 1,
        changedFilesCount: 4,
      }),
    );

    expect(signalTips()).toEqual([
      'Status: CHANGED',
      'Approved: YES · 2 approvals',
      'Checks: FAIL\nAt least one check failed',
      '3 open conversations',
      'Viewed files: 1 of 4',
    ]);
    expect(screen.getByRole('group', { name: 'Signals' })).toHaveAttribute('tabindex', '0');
  });

  test('a signal with nothing to show keeps its place, empty; no change shows no status', () => {
    renderRow(buildEntry({ openConversationCount: 0 }));

    expect(signalTips()).toEqual(['Approved: NO · 0 approvals']);
    expect(screen.getByRole('group', { name: 'Signals' }).querySelectorAll('.ui-signal-empty')).toHaveLength(4);
  });

  test('View in table is a link-styled button that shows the PR in the table, remembering where it was clicked', () => {
    const events = [];
    const handler = (event) => events.push(event.detail);
    window.addEventListener('pr-navigate-to-insights', handler);
    renderRow(buildEntry());

    const button = within(screen.getByText(/^Updated /).closest('.author-pr-row')).getByRole('button', { name: 'View in table' });
    expect(button).toHaveClass('ui-link-button');
    button.click();

    expect(events).toEqual([{ prNumber: '7', repo: 'owner/repo', focusUnsaved: false }]);
    expect(tabState.rememberReturnTarget).toHaveBeenCalledWith(
      expect.objectContaining({ tab: 'author-insights', prNumber: '7', focusTarget: button }),
    );
    expect(tabState.setActiveDataTab).toHaveBeenCalledWith('pr-data');
    window.removeEventListener('pr-navigate-to-insights', handler);
  });
});
