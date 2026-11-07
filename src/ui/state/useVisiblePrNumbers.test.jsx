/** @jest-environment jsdom */

// Regression test for the renderer out-of-memory crash (Chrome "Error code:
// 5"): the per-entry filter-match cache used to gain one permanent result per
// distinct filter-criteria fingerprint - i.e. one per keystroke typed into
// any of the 5 undebounced free-text filter fields, for every loaded PR.
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
const { useFilteredPrRows, useVisiblePrKeys, FILTER_SEARCH_DEBOUNCE_MS } = require('./useVisiblePrNumbers');

// The hook's own fallback shape (it isn't exported) - just the fields it reads.
const BASE_FILTER_VALUES = {
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

      expect(latest.visiblePrKeys).toBeDefined();
      // The hook's own cache instance (the only one created for it).
      const cache = mockCacheInstances[0];
      expect(cache).toBeDefined();
      Object.values(payload.byPrNumber).forEach((entry) => {
        expect(cache.getCachedKeyCount(entry)).toBeLessThanOrEqual(1);
      });
    },
  );
});

describe('useVisiblePrKeys', () => {
  test('typing a search keeps the same arrays until its debounced words change what they are', () => {
    jest.useFakeTimers();
    try {
      const payload = makePayload(3);
      let latest;
      function Probe() {
        latest = useVisiblePrKeys();
        return null;
      }
      const renderWith = (search) => (
        <PrDataContext.Provider value={{ payload }}>
          <FilterStateContext.Provider value={{ values: { ...BASE_FILTER_VALUES, filterSearch: search } }}>
            <RowFilterSelectionProvider>
              <Probe />
            </RowFilterSelectionProvider>
          </FilterStateContext.Provider>
        </PrDataContext.Provider>
      );

      const { rerender } = render(renderWith(''));
      const first = latest;
      expect(first.visiblePrKeys).toHaveLength(3);
      act(() => rerender(renderWith('q')));
      act(() => rerender(renderWith('qz')));
      expect(latest.visiblePrKeys).toBe(first.visiblePrKeys);
      expect(latest.searchTerms).toBe(first.searchTerms);

      act(() => jest.advanceTimersByTime(FILTER_SEARCH_DEBOUNCE_MS));
      expect(latest.visiblePrKeys).toEqual([]);
      expect(latest.searchTerms).toEqual(['qz']);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useFilteredPrRows search', () => {
  test("a PR without an author isn't found by the resolver's \"unknown\"", () => {
    jest.useFakeTimers();
    try {
      const payload = makePayload(2);
      let latest;
      function Probe() {
        latest = useFilteredPrRows();
        return null;
      }
      render(
        <PrDataContext.Provider value={{ payload }}>
          <FilterStateContext.Provider value={{ values: { ...BASE_FILTER_VALUES, filterSearch: 'unknown' } }}>
            <RowFilterSelectionProvider>
              <Probe />
            </RowFilterSelectionProvider>
          </FilterStateContext.Provider>
        </PrDataContext.Provider>,
      );
      expect(latest.searchTerms).toEqual(['unknown']);
      expect(latest.visiblePrKeys).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useFilteredPrRows conversation filters', () => {
  const thread = (comments, extra = {}) => ({ isResolved: false, comments, participants: comments.map((c) => c.authorLogin), ...extra });
  const comment = (authorLogin, createdAt, body = 'A note') => ({ authorLogin, createdAt, body, state: 'SUBMITTED' });
  const payload = {
    byPrNumber: {
      // Waiting on me: the latest comment is someone else's.
      'owner/repo#1': { prNumber: '1', repo: 'owner/repo', data: { number: 1, viewerLogin: 'me', reviewThreads: [thread([comment('me', '2026-11-01T00:00:00Z'), comment('ann', '2026-11-02T00:00:00Z')])] } },
      // With me, answered: the latest comment is mine.
      'owner/repo#2': { prNumber: '2', repo: 'owner/repo', data: { number: 2, viewerLogin: 'me', reviewThreads: [thread([comment('ann', '2026-11-01T00:00:00Z'), comment('me', '2026-11-02T00:00:00Z')])] } },
      // Someone else's conversation, and a resolved one of mine.
      'owner/repo#3': {
        prNumber: '3',
        repo: 'owner/repo',
        data: {
          number: 3,
          viewerLogin: 'me',
          reviewThreads: [thread([comment('ann', '2026-11-01T00:00:00Z')]), thread([comment('me', '2026-11-01T00:00:00Z'), comment('ann', '2026-11-02T00:00:00Z')], { isResolved: true })],
        },
      },
    },
  };
  const visibleWith = (values) => {
    let latest;
    function Probe() {
      latest = useFilteredPrRows();
      return null;
    }
    render(
      <PrDataContext.Provider value={{ payload }}>
        <FilterStateContext.Provider value={{ values: { ...BASE_FILTER_VALUES, ...values } }}>
          <RowFilterSelectionProvider>
            <Probe />
          </RowFilterSelectionProvider>
        </FilterStateContext.Provider>
      </PrDataContext.Provider>,
    );
    return [...latest.visiblePrKeys].sort();
  };

  test('Open conversations with me: unresolved ones I took part in; Waiting on me: of those, the ones someone else spoke last in', () => {
    expect(visibleWith({ onlyOpenConversationsWithMe: true })).toEqual(['owner/repo#1', 'owner/repo#2']);
    expect(visibleWith({ onlyWaitingOnMe: true })).toEqual(['owner/repo#1']);
  });
});
