/** @jest-environment jsdom */

const {
  createPrScopedRowsHelpers,
} = require("./pr-scoped-rows.helpers.js");

describe("pr scoped rows helpers", () => {
  test("given scope inputs, when deriving scoped rows, then scope resolver result is normalized and returned", () => {
    const resolveScopedRows = jest.fn(() => ({
      rows: [{ id: 1 }],
      scopeLabel: "needs attention rows",
    }));
    const normalizeRows = jest.fn((rows) => rows.concat({ id: 2 }));
    const { deriveScopedRows } = createPrScopedRowsHelpers({
      resolveScopedRows,
      normalizeRows,
    });

    const result = deriveScopedRows({
      rowsForRepo: [{ id: 1 }],
      ignoreScopeForPrNumberFilter: false,
      runStamp: "2026-01-01T00:00:00Z",
      useLastRunScope: true,
      selectedScope: "last-run",
      attentionConfig: { enabled: true },
    });

    expect(resolveScopedRows).toHaveBeenCalledWith({
      rowsForRepo: [{ id: 1 }],
      ignoreScopeForPrNumberFilter: false,
      runStamp: "2026-01-01T00:00:00Z",
      useLastRunScope: true,
      selectedScope: "last-run",
      attentionConfig: { enabled: true },
    });
    expect(normalizeRows).toHaveBeenCalledWith([{ id: 1 }]);
    expect(result).toEqual({
      rows: [{ id: 1 }, { id: 2 }],
      scopeLabel: "needs attention rows",
    });
  });

  test("given resolver without rows, when deriving scoped rows, then normalization receives undefined and returns fallback", () => {
    const normalizeRows = jest.fn(() => []);
    const { deriveScopedRows } = createPrScopedRowsHelpers({
      resolveScopedRows: () => ({ scopeLabel: "all stored rows" }),
      normalizeRows,
    });

    const result = deriveScopedRows({
      rowsForRepo: null,
    });

    expect(normalizeRows).toHaveBeenCalledWith(undefined);
    expect(result).toEqual({
      rows: [],
      scopeLabel: "all stored rows",
    });
  });

  test("given missing dependencies, when deriving scoped rows, then safe defaults are used", () => {
    const { deriveScopedRows } = createPrScopedRowsHelpers();

    const result = deriveScopedRows({
      rowsForRepo: [{ id: 1 }],
    });

    expect(result).toEqual({
      rows: [],
      scopeLabel: "all stored rows",
    });
  });

  test("given resolver default and identity normalizer, when deriving scoped rows, then input rows are preserved", () => {
    const { deriveScopedRows } = createPrScopedRowsHelpers({
      resolveScopedRows: ({ rowsForRepo }) => ({
        rows: rowsForRepo,
        scopeLabel: "all stored rows",
      }),
      normalizeRows: (rows) => (Array.isArray(rows) ? rows : []),
    });

    const result = deriveScopedRows({
      rowsForRepo: [{ id: 1 }, { id: 2 }],
    });

    expect(result).toEqual({
      rows: [{ id: 1 }, { id: 2 }],
      scopeLabel: "all stored rows",
    });
  });
});
