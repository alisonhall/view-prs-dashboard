const {
  normalizeRows,
  sortRowsByPrNumberDesc,
  sortRowsByDateFieldDesc,
} = require("./pr-row-sorting.helpers.js");

describe("pr row sorting helpers", () => {
  describe("normalizeRows", () => {
    test("given rows with different rowOrder values, when normalizing, then they sort ascending by rowOrder", () => {
      const rows = [{ rowOrder: 2, prNumber: "1" }, { rowOrder: 1, prNumber: "2" }];

      expect(normalizeRows(rows).map((r) => r.prNumber)).toEqual(["2", "1"]);
    });

    test("given a row with no rowOrder, when normalizing, then it sorts after rows that have one", () => {
      const rows = [{ prNumber: "1" }, { rowOrder: 5, prNumber: "2" }];

      expect(normalizeRows(rows).map((r) => r.prNumber)).toEqual(["2", "1"]);
    });

    test("given rows with the same rowOrder, when normalizing, then they tie-break by PR number descending", () => {
      const rows = [{ rowOrder: 1, prNumber: "5" }, { rowOrder: 1, prNumber: "10" }];

      expect(normalizeRows(rows).map((r) => r.prNumber)).toEqual(["10", "5"]);
    });
  });

  describe("sortRowsByPrNumberDesc", () => {
    test("given rows with data.number, when sorting, then they sort descending by that number", () => {
      const rows = [{ data: { number: "5" } }, { data: { number: "20" } }, { data: { number: "1" } }];

      expect(sortRowsByPrNumberDesc(rows).map((r) => r.data.number)).toEqual(["20", "5", "1"]);
    });

    test("given rows with only prNumber (no data.number), when sorting, then prNumber is used as a fallback", () => {
      const rows = [{ prNumber: "3" }, { prNumber: "9" }];

      expect(sortRowsByPrNumberDesc(rows).map((r) => r.prNumber)).toEqual(["9", "3"]);
    });
  });

  describe("sortRowsByDateFieldDesc", () => {
    test("given rows with different dates, when sorting, then they sort descending by that field", () => {
      const rows = [
        { prNumber: "1", data: { mergedAt: "2026-01-01" } },
        { prNumber: "2", data: { mergedAt: "2026-03-01" } },
      ];

      expect(sortRowsByDateFieldDesc(rows, "mergedAt").map((r) => r.prNumber)).toEqual(["2", "1"]);
    });

    test("given a row with a missing/invalid date, when sorting, then it sorts after rows with a valid date", () => {
      const rows = [
        { prNumber: "1", data: {} },
        { prNumber: "2", data: { mergedAt: "2026-01-01" } },
      ];

      expect(sortRowsByDateFieldDesc(rows, "mergedAt").map((r) => r.prNumber)).toEqual(["2", "1"]);
    });

    test("given rows with the same date, when sorting, then they tie-break by PR number descending", () => {
      const rows = [
        { prNumber: "5", data: { mergedAt: "2026-01-01" } },
        { prNumber: "10", data: { mergedAt: "2026-01-01" } },
      ];

      expect(sortRowsByDateFieldDesc(rows, "mergedAt").map((r) => r.prNumber)).toEqual(["10", "5"]);
    });
  });
});
