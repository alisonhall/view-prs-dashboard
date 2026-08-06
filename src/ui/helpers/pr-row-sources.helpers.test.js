/** @jest-environment jsdom */

const {
  createPrRowSourcesHelpers,
} = require("./pr-row-sources.helpers.js");

describe("pr row sources helpers", () => {
  test("given repo filter, when deriving row sources, then rowsForRepo only includes matching repo entries", () => {
    const normalizeRows = jest.fn((rows) => rows);
    const { deriveRowSources } = createPrRowSourcesHelpers({ normalizeRows });

    const result = deriveRowSources({
      allEntries: [
        { repo: "org/repo-a", id: 1 },
        { repo: "org/repo-b", id: 2 },
        { repo: "org/repo-a", id: 3 },
      ],
      repoFilter: "org/repo-a",
    });

    expect(result.rowsForRepo).toEqual([
      { repo: "org/repo-a", id: 1 },
      { repo: "org/repo-a", id: 3 },
    ]);
    expect(result.allStoredRows).toEqual([
      { repo: "org/repo-a", id: 1 },
      { repo: "org/repo-b", id: 2 },
      { repo: "org/repo-a", id: 3 },
    ]);
    expect(normalizeRows).toHaveBeenCalledWith([
      { repo: "org/repo-a", id: 1 },
      { repo: "org/repo-b", id: 2 },
      { repo: "org/repo-a", id: 3 },
    ]);
  });

  test("given empty repo filter, when deriving row sources, then rowsForRepo includes all entries", () => {
    const { deriveRowSources } = createPrRowSourcesHelpers({
      normalizeRows: (rows) => rows,
    });

    const result = deriveRowSources({
      allEntries: [
        { repo: "org/repo-a", id: 1 },
        { repo: "org/repo-b", id: 2 },
      ],
      repoFilter: "",
    });

    expect(result.rowsForRepo).toEqual([
      { repo: "org/repo-a", id: 1 },
      { repo: "org/repo-b", id: 2 },
    ]);
  });

  test("given non-array entries, when deriving row sources, then both outputs are empty arrays", () => {
    const { deriveRowSources } = createPrRowSourcesHelpers({
      normalizeRows: (rows) => rows,
    });

    const result = deriveRowSources({
      allEntries: null,
      repoFilter: "org/repo-a",
    });

    expect(result).toEqual({
      rowsForRepo: [],
      allStoredRows: [],
    });
  });
});
