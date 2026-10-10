/** @jest-environment jsdom */

const { useEffect } = require('react');
const { render, screen, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { useRowFilterSelection } = require('./RowFilterSelectionContext');
const { PrDataProvider } = require('./PrDataProvider');
const { FilterStateProvider } = require('./FilterStateProvider');
const { RowFilterSelectionProvider } = require('./RowFilterSelectionProvider');
const { JobEventsContext } = require('./JobEventsContext');
const { useAppliedFilterSummary } = require('./useAppliedFilterSummary');

const SCHEDULER_SUMMARY = {
  intervalMinutes: 15,
  manualCooldownMinutes: 15,
  lastManualRunAt: null,
  lastAutoRunAt: '2026-01-01T00:05:00.000Z',
  lastAutoSkipReason: null,
  lastAutoError: null,
};

function Probe() {
  const { summaryText, filterChips } = useAppliedFilterSummary();
  return (
    <div>
      <span data-testid="summary-text">{summaryText}</span>
      <span data-testid="filter-chips">{filterChips.join('|')}</span>
    </div>
  );
}

function Seed({ listId, values }) {
  const { setChecked } = useRowFilterSelection();
  // Effect, not a direct render-body call - setChecked always returns a
  // new Set reference, so calling it unconditionally during render would
  // re-trigger a render loop.
  useEffect(() => {
    setChecked(listId, values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

const renderProbe = ({
  payload,
  selectedRepo,
  filterStateValues,
  schedulerSummary = SCHEDULER_SUMMARY,
} = {}) =>
  render(
    <PrDataProvider initialPayload={payload} initialSelectedRepo={selectedRepo}>
      <FilterStateProvider
        initialValues={{
          scopeMode: 'all',
          filterPrNumbers: '',
          alwaysShowInReview: false,
          openMode: 'none',
          ...filterStateValues,
        }}
      >
        <RowFilterSelectionProvider>
          <JobEventsContext.Provider value={{ schedulerSummary }}>
            <Probe />
          </JobEventsContext.Provider>
        </RowFilterSelectionProvider>
      </FilterStateProvider>
    </PrDataProvider>,
  );

describe('useAppliedFilterSummary', () => {
  test('given no filters active, when rendered, then the summary text includes the repo, scope, and row count', () => {
    const payload = { byPrNumber: { 1: { prNumber: '1', data: { number: 1 } } } };
    renderProbe({ payload, selectedRepo: 'owner/repo' });

    const summaryText = screen.getByTestId('summary-text').textContent;
    expect(summaryText).toContain('repo=owner/repo');
    expect(summaryText).toContain('scope=all stored rows');
    expect(summaryText).toContain('Rows: 1');
  });

  test('given a PR-number filter, when rendered, then the chip text includes it and the row count reflects the filtered table', () => {
    const payload = {
      byPrNumber: {
        1: { prNumber: '1', data: { number: 1 } },
        2: { prNumber: '2', data: { number: 2 } },
      },
    };
    renderProbe({ payload, selectedRepo: 'owner/repo', filterStateValues: { filterPrNumbers: '1' } });

    const summaryText = screen.getByTestId('summary-text').textContent;
    expect(summaryText).toContain('pr-numbers=1');
    expect(summaryText).toContain('Rows: 1');
  });

  test('given the scheduler-summary Context value, when rendered, then the summary text includes its lastAutoRunAt', () => {
    const payload = { byPrNumber: {} };
    renderProbe({ payload, selectedRepo: 'owner/repo' });

    expect(screen.getByTestId('summary-text').textContent).toContain(
      'Last auto: 2026-01-01T00:05:00.000Z',
    );
  });

  test('given a checked include-label filter (RowFilterSelectionContext), when rendered, then the chip text includes it as a comma-joined display string', () => {
    const payload = { byPrNumber: { 1: { prNumber: '1', data: { number: 1, labels: ['bug'] } } } };

    render(
      <PrDataProvider initialPayload={payload} initialSelectedRepo="owner/repo">
        <FilterStateProvider initialValues={{ scopeMode: 'all', filterPrNumbers: '' }}>
          <RowFilterSelectionProvider>
            <Seed listId="label-list" values={['bug', 'docs']} />
            <JobEventsContext.Provider value={{ schedulerSummary: SCHEDULER_SUMMARY }}>
              <Probe />
            </JobEventsContext.Provider>
          </RowFilterSelectionProvider>
        </FilterStateProvider>
      </PrDataProvider>,
    );

    expect(screen.getByTestId('summary-text').textContent).toContain('label=bug, docs');
  });

  test('given no RowFilterSelectionContext.setChecked call at all (no row-filtering selections), when rendered, then no label/author/assigned/approver chip is included', () => {
    const payload = { byPrNumber: { 1: { prNumber: '1', data: { number: 1 } } } };
    renderProbe({ payload, selectedRepo: 'owner/repo' });

    const filterChips = screen.getByTestId('filter-chips').textContent;
    expect(filterChips).not.toContain('label=');
    expect(filterChips).not.toContain('author=');
  });

  // Regression test: filterPrNumbers-for-display used to be read raw
  // (undebounced) while rowsCount came from useFilteredPrRows()
  // (debounced) - the two could visibly disagree with each other while
  // typing (e.g. "pr-numbers=12 | Rows: 1" for up to 150ms). Both must now
  // move together.
  describe('filterPrNumbers debounce (see pr-visible-pr-numbers helpers for rowsCount side)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      delete window.getFilterStateValues;
      delete window.setFilterStateValue;
      delete window.debouncedApplyFilters;
      jest.useRealTimers();
    });

    test('given a PR-number filter change, when read immediately (before the 150ms debounce elapses), then pr-numbers and Rows both still reflect the OLD value together, never a mismatched pair', () => {
      // Only PR #1 exists (no PR #12) specifically so the two filter
      // states ("1" vs "12") produce a DIFFERENT row count (1 vs 0) - a
      // real discriminator, unlike a payload where both filters happen to
      // match exactly one row each.
      const payload = { byPrNumber: { 1: { prNumber: '1', data: { number: 1 } } } };
      renderProbe({ payload, selectedRepo: 'owner/repo', filterStateValues: { filterPrNumbers: '1' } });

      expect(screen.getByTestId('summary-text').textContent).toContain('pr-numbers=1 ');
      expect(screen.getByTestId('summary-text').textContent).toContain('Rows: 1');

      act(() => {
        window.setFilterStateValue('filterPrNumbers', '12');
      });
      // Deliberately NOT advancing timers yet - both debounced values
      // (useFilteredPrRows' internal one, and this hook's own) should
      // still be holding the OLD "1"/"Rows: 1" pair together, not a mix
      // of the new "pr-numbers=12" text with the old "Rows: 1" count (the
      // bug) or any other inconsistent combination.
      const midDebounceText = screen.getByTestId('summary-text').textContent;
      expect(midDebounceText).toContain('pr-numbers=1 ');
      expect(midDebounceText).toContain('Rows: 1');
      expect(midDebounceText).not.toContain('pr-numbers=12');

      act(() => {
        jest.advanceTimersByTime(150);
      });
      const afterDebounceText = screen.getByTestId('summary-text').textContent;
      expect(afterDebounceText).toContain('pr-numbers=12');
      expect(afterDebounceText).toContain('Rows: 0');
    });
  });
});
