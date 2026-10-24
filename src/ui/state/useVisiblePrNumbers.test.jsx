/** @jest-environment jsdom */

// Regression test for the renderer out-of-memory crash (Chrome "Error code:
// 5"): the per-entry filter-match cache used to gain one permanent result per
// distinct filter-criteria fingerprint - i.e. one per keystroke typed into
// any of the 6 undebounced free-text filter fields, for every loaded PR.
// This drives the real hook (not just the helpers) so it also proves
// useFilteredPrRows actually wires the bounded cache in.

const mockCacheInstances = [];
jest.mock('../helpers/pr-entry-derived-cache.helpers.ts', () => {
  const actual = jest.requireActual('../helpers/pr-entry-derived-cache.helpers.ts');
  return {
    createEntryDerivedCache: (...args) => {
      const cache = actual.createEntryDerivedCache(...args);
      mockCacheInstances.push(cache);
      return cache;
    },
  };
});

const { render, act } = require('@testing-library/react');
const { PrDataContext } = require('./PrDataContext');
const { FilterStateContext } = require('./FilterStateContext');
const { RowFilterSelectionProvider } = require('./RowFilterSelectionProvider');
const { useFilteredPrRows } = require('./useVisiblePrNumbers');

// The hook's own fallback shape (it isn't exported) - just the fields it reads.
const BASE_FILTER_VALUES = {
  scopeMode: 'all',
  filterPrNumbers: '',
  alwaysShowInReview: false,
  filterCustomComments: '',
  filterOtherNotes: '',
  filterPrDifficulty: '',
  filterStories: '',
  filterAnalysisOfPr: '',
};

const FREE_TEXT_FIELDS = [
  'filterCustomComments',
  'filterOtherNotes',
  'filterPrDifficulty',
  'filterStories',
  'filterAnalysisOfPr',
];

const makePayload = (count) => ({
  byPrNumber: Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const number = String(index + 1);
      return [
        number,
        { prNumber: number, repo: 'owner/repo', data: { number: index + 1, labels: [], notesSummary: {} } },
      ];
    }),
  ),
});

describe('useFilteredPrRows filter-match cache', () => {
  beforeEach(() => {
    mockCacheInstances.length = 0;
  });

  test.each(FREE_TEXT_FIELDS)(
    'given %s is typed into one keystroke at a time, when the table re-filters, then no PR entry accumulates more than one cached filter result',
    (field) => {
      const payload = makePayload(25);
      let latest;
      function Probe() {
        latest = useFilteredPrRows();
        return null;
      }
      const renderWith = (text) => (
        <PrDataContext.Provider value={{ payload }}>
          <FilterStateContext.Provider value={{ values: { ...BASE_FILTER_VALUES, [field]: text } }}>
            <RowFilterSelectionProvider>
              <Probe />
            </RowFilterSelectionProvider>
          </FilterStateContext.Provider>
        </PrDataContext.Provider>
      );

      const { rerender } = render(renderWith(''));
      const typed = 'some free text typed one character at a time'.repeat(3);
      for (let length = 1; length <= typed.length; length += 1) {
        act(() => {
          rerender(renderWith(typed.slice(0, length)));
        });
      }

      expect(latest.visiblePrNumbers).toBeDefined();
      // The hook's own cache instance (the only one created for it).
      const cache = mockCacheInstances[0];
      expect(cache).toBeDefined();
      Object.values(payload.byPrNumber).forEach((entry) => {
        expect(cache.getCachedKeyCount(entry)).toBeLessThanOrEqual(1);
      });
    },
  );
});
