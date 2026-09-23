/** @jest-environment jsdom */

const {
  createPrSectionGroupingHelpers,
} = require("./pr-section-grouping.helpers.js");

describe("pr section grouping helpers", () => {
  test("given mixed section rows, when building grouped sections, then rows are grouped and sorter dependencies are used", () => {
    const sortRowsByPrNumberDesc = jest.fn((rows) =>
      [...rows].sort((a, b) => Number(b.data.number) - Number(a.data.number)),
    );
    const sortRowsByDateFieldDesc = jest.fn((rows, field) =>
      [...rows].sort((a, b) =>
        String(b.data?.[field] || "").localeCompare(String(a.data?.[field] || "")),
      ),
    );
    const { buildGroupedPrSections } = createPrSectionGroupingHelpers({
      sortRowsByPrNumberDesc,
      sortRowsByDateFieldDesc,
    });

    const grouped = buildGroupedPrSections([
      { section: "open", data: { number: 102 } },
      { section: "open", data: { number: 101 } },
      { section: "draft", data: { number: 201 } },
      { section: "closed", data: { closedAt: "2026-07-16T00:00:00Z" } },
      { section: "closed", data: { closedAt: "2026-07-17T00:00:00Z" } },
      { section: "merged", data: { mergedAt: "2026-07-11T00:00:00Z" } },
      { section: "merged", data: { mergedAt: "2026-07-12T00:00:00Z" } },
      { section: "ignored", data: { number: 999 } },
    ]);

    expect(grouped.open.map((entry) => entry.data.number)).toEqual([102, 101]);
    expect(grouped.draft.map((entry) => entry.data.number)).toEqual([201]);
    expect(grouped.closed.map((entry) => entry.data.closedAt)).toEqual([
      "2026-07-17T00:00:00Z",
      "2026-07-16T00:00:00Z",
    ]);
    expect(grouped.merged.map((entry) => entry.data.mergedAt)).toEqual([
      "2026-07-12T00:00:00Z",
      "2026-07-11T00:00:00Z",
    ]);

    expect(sortRowsByPrNumberDesc).toHaveBeenCalledTimes(2);
    expect(sortRowsByDateFieldDesc).toHaveBeenCalledTimes(2);
    expect(sortRowsByDateFieldDesc).toHaveBeenNthCalledWith(
      1,
      expect.any(Array),
      "closedAt",
    );
    expect(sortRowsByDateFieldDesc).toHaveBeenNthCalledWith(
      2,
      expect.any(Array),
      "mergedAt",
    );
  });

  test("given non-array rows input, when building grouped sections, then all grouped lists are empty", () => {
    const { buildGroupedPrSections } = createPrSectionGroupingHelpers({
      sortRowsByPrNumberDesc: (rows) => rows,
      sortRowsByDateFieldDesc: (rows) => rows,
    });

    const grouped = buildGroupedPrSections(null);

    expect(grouped).toEqual({
      open: [],
      draft: [],
      closed: [],
      merged: [],
    });
  });

  test("given the same row array reference-for-reference as the previous call, when building grouped sections again, then the cached result is returned without re-sorting", () => {
    const sortRowsByPrNumberDesc = jest.fn((rows) => rows);
    const sortRowsByDateFieldDesc = jest.fn((rows) => rows);
    const { buildGroupedPrSections } = createPrSectionGroupingHelpers({
      sortRowsByPrNumberDesc,
      sortRowsByDateFieldDesc,
    });

    const rows = [
      { section: "open", data: { number: 1 } },
      { section: "closed", data: { closedAt: "2026-07-16T00:00:00Z" } },
    ];

    const first = buildGroupedPrSections(rows);
    // Called once per section (open, draft) / (closed, merged) regardless
    // of how many rows actually belong to each - matches the existing
    // "given mixed section rows" test's own call-count expectations above.
    expect(sortRowsByPrNumberDesc).toHaveBeenCalledTimes(2);
    expect(sortRowsByDateFieldDesc).toHaveBeenCalledTimes(2);

    const second = buildGroupedPrSections([...rows]);
    expect(second).toBe(first);
    expect(sortRowsByPrNumberDesc).toHaveBeenCalledTimes(2);
    expect(sortRowsByDateFieldDesc).toHaveBeenCalledTimes(2);
  });

  test("given a row array with a different entry reference at some position, when building grouped sections again, then it recomputes", () => {
    const sortRowsByPrNumberDesc = jest.fn((rows) => rows);
    const sortRowsByDateFieldDesc = jest.fn((rows) => rows);
    const { buildGroupedPrSections } = createPrSectionGroupingHelpers({
      sortRowsByPrNumberDesc,
      sortRowsByDateFieldDesc,
    });

    const entryA = { section: "open", data: { number: 1 } };
    buildGroupedPrSections([entryA]);
    expect(sortRowsByPrNumberDesc).toHaveBeenCalledTimes(2);

    const entryB = { section: "open", data: { number: 1 } };
    buildGroupedPrSections([entryB]);
    expect(sortRowsByPrNumberDesc).toHaveBeenCalledTimes(4);
  });
});
