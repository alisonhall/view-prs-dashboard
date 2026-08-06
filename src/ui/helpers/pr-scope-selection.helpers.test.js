/** @jest-environment jsdom */

const {
  createPrScopeSelectionHelpers,
} = require("./pr-scope-selection.helpers.js");

describe("pr scope selection helpers", () => {
  test("given invalid scope value, when normalizing selected scope, then all scope is returned", () => {
    const { normalizeSelectedScope } = createPrScopeSelectionHelpers();

    expect(normalizeSelectedScope("not-a-scope")).toBe("all");
  });

  test("given mixed case scope value, when normalizing selected scope, then normalized supported scope is returned", () => {
    const { normalizeSelectedScope } = createPrScopeSelectionHelpers();

    expect(normalizeSelectedScope(" Needs-Attention ")).toBe(
      "needs-attention",
    );
  });

  test("given pr number filter scope bypass, when resolving scoped rows, then rows remain unchanged with all stored label", () => {
    const rowsForRepo = [{ id: 1 }, { id: 2 }];
    const { resolveScopedRows } = createPrScopeSelectionHelpers({
      entryNeedsAttention: () => true,
      entryHasYourLastActivity: () => true,
    });

    const result = resolveScopedRows({
      rowsForRepo,
      ignoreScopeForPrNumberFilter: true,
      runStamp: "2026-07-17",
      useLastRunScope: true,
      selectedScope: "needs-attention",
      attentionConfig: {},
    });

    expect(result).toEqual({
      rows: rowsForRepo,
      scopeLabel: "all stored rows",
    });
  });

  test("given last run scope with matching rows, when resolving scoped rows, then only matching updatedAt rows are returned", () => {
    const rowsForRepo = [
      { id: 1, updatedAt: "run-1" },
      { id: 2, updatedAt: "run-2" },
      { id: 3, updatedAt: "run-1" },
    ];
    const { resolveScopedRows } = createPrScopeSelectionHelpers();

    const result = resolveScopedRows({
      rowsForRepo,
      ignoreScopeForPrNumberFilter: false,
      runStamp: "run-1",
      useLastRunScope: true,
      selectedScope: "last-run",
      attentionConfig: {},
    });

    expect(result.scopeLabel).toBe("last run rows");
    expect(result.rows).toEqual([
      { id: 1, updatedAt: "run-1" },
      { id: 3, updatedAt: "run-1" },
    ]);
  });

  test("given needs attention scope, when resolving scoped rows, then only attention rows are returned", () => {
    const rowsForRepo = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const entryNeedsAttention = jest.fn((entry) => entry.id !== 2);
    const { resolveScopedRows } = createPrScopeSelectionHelpers({
      entryNeedsAttention,
      entryHasYourLastActivity: () => false,
    });

    const result = resolveScopedRows({
      rowsForRepo,
      ignoreScopeForPrNumberFilter: false,
      runStamp: "",
      useLastRunScope: false,
      selectedScope: "needs-attention",
      attentionConfig: { mode: "all" },
    });

    expect(result.scopeLabel).toBe("needs attention rows");
    expect(result.rows).toEqual([{ id: 1 }, { id: 3 }]);
    expect(entryNeedsAttention).toHaveBeenCalledTimes(3);
  });

  test("given needs attention or interacted scope, when resolving scoped rows, then rows matching either predicate are returned", () => {
    const rowsForRepo = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const { resolveScopedRows } = createPrScopeSelectionHelpers({
      entryNeedsAttention: (entry) => entry.id === 1,
      entryHasYourLastActivity: (entry) => entry.id === 3,
    });

    const result = resolveScopedRows({
      rowsForRepo,
      ignoreScopeForPrNumberFilter: false,
      runStamp: "",
      useLastRunScope: false,
      selectedScope: "needs-attention-or-interacted",
      attentionConfig: {},
    });

    expect(result.scopeLabel).toBe("needs attention or interacted rows");
    expect(result.rows).toEqual([{ id: 1 }, { id: 3 }]);
  });
});
