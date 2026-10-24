/** @jest-environment jsdom */

const { render } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { PrStatusCell } = require('./PrStatusCell');

describe('PrStatusCell', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const renderCell = (pr, extra = {}) =>
    render(
      <table>
        <tbody>
          <tr>
            <PrStatusCell pr={pr} lastCheckedAt="2026-01-01T00:00:00Z" sectionKey="open" {...extra} />
          </tr>
        </tbody>
      </table>,
    );

  test('given a plain status, when rendering, then shows the status text and statusClass', () => {
    renderCell({ status: 'NO_CHANGE' });
    const td = document.querySelector('td');
    expect(td).toHaveClass('status-cell', 'status-no-change');
    expect(td.querySelector('.status-cell-content > div').textContent).toBe('NO_CHANGE');
  });

  test('given a changed status with a reason, when isChangedStatus is true, then appends the reason', () => {
    renderCell({ status: 'CHANGED', reason: 'new-commits' });
    expect(document.querySelector('.status-cell-content > div').textContent).toBe('CHANGED(new-commits)');
  });

  // getViewedFilesState is a real, directly-imported function now (Phase
  // 7, see REACT_MIGRATION_PLAN.md) - drives this from real
  // viewedFilesCount/changedFilesCount fixture fields instead of mocking
  // window.getViewedFilesState.
  test('given viewed-files state, when rendering, then shows the viewed/changed progress', () => {
    renderCell({ viewedFilesCount: 3, changedFilesCount: 5 });
    const progress = document.querySelector('.approved-viewed-progress');
    expect(progress).toHaveTextContent('3/5');
    expect(progress).toHaveClass('approved-viewed-progress-incomplete');
  });

  test('given a stale last-checked indicator, when rendering, then applies the stale class and title', () => {
    // buildPrLastCheckedIndicator is a real, directly-imported function now
    // (Phase 7, see REACT_MIGRATION_PLAN.md) - fixes "now" via fake timers
    // instead of mocking the function, so this exercises its real
    // elapsed-time/staleness logic (an "open" section's indicator goes
    // stale past 15 minutes - see OPEN_PR_LAST_CHECK_STALE_MS).
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T02:00:00Z'));
    renderCell({});
    const indicator = document.querySelector('.pr-last-checked-indicator');
    expect(indicator).toHaveTextContent('↻ 2h ago');
    expect(indicator).toHaveClass('pr-last-checked-indicator-stale');
    expect(indicator).toHaveAttribute('title', expect.stringContaining('Last checked for updates at'));
  });

  test('given updatePending is true, when rendering, then shows the update-queued badge', () => {
    renderCell({ updatePending: true });
    const badge = document.querySelector('.pr-update-pending-badge');
    expect(badge).toHaveTextContent('Update queued');
    expect(badge).toHaveAttribute(
      'title',
      'A change was detected on GitHub; full details are queued to refresh.',
    );
  });

  test('given updatePending is false, when rendering, then omits the update-queued badge', () => {
    renderCell({ updatePending: false });
    expect(document.querySelector('.pr-update-pending-badge')).not.toBeInTheDocument();
  });

  test('given no updatePending field at all, when rendering, then omits the update-queued badge', () => {
    renderCell({});
    expect(document.querySelector('.pr-update-pending-badge')).not.toBeInTheDocument();
  });
});
