/** @jest-environment jsdom */

const {
  createPrRowFilteringHelpers,
} = require("./pr-row-filtering.helpers.ts");
const { createEntryDerivedCache } = require("./pr-entry-derived-cache.helpers.ts");

describe("pr row filtering helpers", () => {
  test("given filter inputs, when building row filter criteria, then criteria object preserves arrays and boolean", () => {
    const { buildRowFilterCriteria } = createPrRowFilteringHelpers();

    const criteria = buildRowFilterCriteria({
      prNumbers: ["101", "102"],
      includeLabels: ["bug"],
      excludeLabels: ["wip"],
      authorLogins: ["alice"],
      assignedLogins: ["bob"],
      approverLogins: ["carol"],
      alwaysShowInReview: true,
      customComments: "with",
      otherNotes: "without",
      prDifficulty: "3",
      stories: "name-only",
      analysisOfPr: "with",
    });

    expect(criteria).toEqual({
      prNumbers: ["101", "102"],
      includeLabels: ["bug"],
      excludeLabels: ["wip"],
      authorLogins: ["alice"],
      assignedLogins: ["bob"],
      approverLogins: ["carol"],
      alwaysShowInReview: true,
      customComments: "with",
      otherNotes: "without",
      prDifficulty: "3",
      stories: "name-only",
      analysisOfPr: "with",
    });
  });

  test("given missing inputs, when building row filter criteria, then defaults are empty arrays and false", () => {
    const { buildRowFilterCriteria } = createPrRowFilteringHelpers();

    const criteria = buildRowFilterCriteria();

    expect(criteria).toEqual({
      prNumbers: [],
      includeLabels: [],
      excludeLabels: [],
      authorLogins: [],
      assignedLogins: [],
      approverLogins: [],
      alwaysShowInReview: false,
      customComments: "",
      otherNotes: "",
      prDifficulty: "",
      stories: "",
      analysisOfPr: "",
    });
  });

  test("given rows and matcher, when applying row ui filters, then only matching rows are returned", () => {
    const rowMatchesUiFilters = jest.fn((entry, criteria) => {
      if (criteria.authorLogins.includes("alice")) {
        return entry.id !== 2;
      }
      return true;
    });
    const { applyRowUiFilters } = createPrRowFilteringHelpers({
      rowMatchesUiFilters,
    });

    const filteredRows = applyRowUiFilters(
      [{ id: 1 }, { id: 2 }, { id: 3 }],
      {
        authorLogins: ["alice"],
      },
    );

    expect(filteredRows).toEqual([{ id: 1 }, { id: 3 }]);
    expect(rowMatchesUiFilters).toHaveBeenCalledTimes(3);
  });

  test("given non-array rows, when applying row ui filters, then empty result is returned", () => {
    const { applyRowUiFilters } = createPrRowFilteringHelpers({
      rowMatchesUiFilters: () => true,
    });

    expect(applyRowUiFilters(null, { authorLogins: ["alice"] })).toEqual([]);
  });

  test("given a getOrCompute cache, when applying row ui filters twice with the same rows and criteria, then the matcher is only called once per row", () => {
    const rowMatchesUiFilters = jest.fn(() => true);
    const cache = new Map();
    const getOrCompute = (entry, cacheKey, compute) => {
      const key = `${entry.id}:${cacheKey}`;
      if (!cache.has(key)) {
        cache.set(key, compute());
      }
      return cache.get(key);
    };
    const { applyRowUiFilters } = createPrRowFilteringHelpers({
      rowMatchesUiFilters,
      getOrCompute,
    });
    const rows = [{ id: 1 }, { id: 2 }];
    const criteria = { authorLogins: ["alice"] };

    applyRowUiFilters(rows, criteria);
    applyRowUiFilters(rows, criteria);

    expect(rowMatchesUiFilters).toHaveBeenCalledTimes(2);
  });

  test("given a getOrCompute cache, when applying row ui filters with different criteria, then the matcher is recomputed", () => {
    const rowMatchesUiFilters = jest.fn(() => true);
    const cache = new Map();
    const getOrCompute = (entry, cacheKey, compute) => {
      const key = `${entry.id}:${cacheKey}`;
      if (!cache.has(key)) {
        cache.set(key, compute());
      }
      return cache.get(key);
    };
    const { applyRowUiFilters } = createPrRowFilteringHelpers({
      rowMatchesUiFilters,
      getOrCompute,
    });
    const rows = [{ id: 1 }];

    applyRowUiFilters(rows, { authorLogins: ["alice"] });
    applyRowUiFilters(rows, { authorLogins: ["bob"] });

    expect(rowMatchesUiFilters).toHaveBeenCalledTimes(2);
  });

  describe("typing into the undebounced free-text filter fields (regression: renderer OOM, Chrome 'Error code: 5')", () => {
    const FREE_TEXT_FIELDS = [
      "customComments",
      "otherNotes",
      "prDifficulty",
      "stories",
      "analysisOfPr",
    ];

    test.each(FREE_TEXT_FIELDS)(
      "given a keystroke-by-keystroke change to %s on many loaded PRs, when filtering each time, then each entry's cache stays at one key and results stay correct",
      (field) => {
        const { getOrCompute, getOrComputeLatest, getCachedKeyCount } = createEntryDerivedCache();
        const rowMatchesUiFilters = jest.fn((entry, criteria) =>
          entry.text.includes(criteria[field]),
        );
        const { buildRowFilterCriteria, applyRowUiFilters } = createPrRowFilteringHelpers({
          rowMatchesUiFilters,
          getOrCompute,
          getOrComputeLatest,
        });
        const rows = Array.from({ length: 30 }, (_, index) => ({
          id: index,
          text: index % 2 === 0 ? "alpha beta" : "gamma",
        }));
        const typed = "alpha beta".repeat(20);

        let lastResult;
        for (let length = 1; length <= typed.length; length += 1) {
          const criteria = buildRowFilterCriteria({ [field]: typed.slice(0, length) });
          lastResult = applyRowUiFilters(rows, criteria);
        }

        rows.forEach((row) => expect(getCachedKeyCount(row)).toBe(1));
        // The full typed text ("alpha betaalpha beta...") matches nothing.
        expect(lastResult).toEqual([]);
        // An earlier, shorter prefix still filters correctly after recompute.
        const early = applyRowUiFilters(rows, buildRowFilterCriteria({ [field]: "alpha" }));
        expect(early.map((row) => row.id)).toEqual(
          rows.filter((row) => row.id % 2 === 0).map((row) => row.id),
        );
      },
    );

    test("given unchanged criteria and rows, when filtering again after typing, then the cached result is reused (no recompute)", () => {
      const { getOrCompute, getOrComputeLatest } = createEntryDerivedCache();
      const rowMatchesUiFilters = jest.fn(() => true);
      const { buildRowFilterCriteria, applyRowUiFilters } = createPrRowFilteringHelpers({
        rowMatchesUiFilters,
        getOrCompute,
        getOrComputeLatest,
      });
      const rows = [{ id: 1 }, { id: 2 }];
      const criteria = buildRowFilterCriteria({ customComments: "abc" });

      applyRowUiFilters(rows, criteria);
      applyRowUiFilters(rows, criteria);

      expect(rowMatchesUiFilters).toHaveBeenCalledTimes(2);
    });
  });
});
