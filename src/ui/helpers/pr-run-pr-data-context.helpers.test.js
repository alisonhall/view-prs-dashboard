/** @jest-environment jsdom */

const {
  createPrRunPrDataContextHelpers,
} = require("./pr-run-pr-data-context.helpers.js");

describe("pr run pr data context helpers", () => {
  test("given payload and runtime inputs, when deriving run-pr-data context, then composed render/repo/scope/row-source context is returned", () => {
    const captureRenderContext = jest.fn(() => ({
      sectionsHost: { id: "sections" },
      insightsViewState: { expanded: ["1"] },
      prSectionOpenState: { opened: true },
      meta: { textContent: "" },
      scopeSelect: { value: "last-run" },
      allEntries: [{ id: 1 }],
      lastRun: { repo: "org/repo", updatedAt: "2026-07-17T00:00:00Z" },
    }));
    const deriveRepoRunContext = jest.fn(() => ({
      repoFilter: "org/repo",
      runStamp: "2026-07-17T00:00:00Z",
      normalizedRunStamp: "2026-07-17T00:00:00Z",
    }));
    const deriveScopeSettings = jest.fn(() => ({
      filterPrNumbers: ["123"],
      selectedScope: "last-run",
      ignoreScopeForPrNumberFilter: true,
      useLastRunScope: true,
    }));
    const getNeedsAttentionConfig = jest.fn(() => ({ enabled: true }));
    const deriveRowSources = jest.fn(() => ({
      rowsForRepo: [{ id: 1 }],
      allStoredRows: [{ id: 1 }, { id: 2 }],
    }));

    const { deriveRunPrDataContext } = createPrRunPrDataContextHelpers({
      captureRenderContext,
      deriveRepoRunContext,
      deriveScopeSettings,
      getNeedsAttentionConfig,
      deriveRowSources,
    });

    const result = deriveRunPrDataContext({
      payload: { byPrNumber: { "1": { id: 1 } } },
      selectedRepo: "org/repo",
      inputRepo: "org/repo",
      filterPrNumbersRaw: "123",
      optionsUseLastRunScope: true,
    });

    expect(captureRenderContext).toHaveBeenCalledWith({ byPrNumber: { "1": { id: 1 } } });
    expect(deriveRepoRunContext).toHaveBeenCalledWith({
      selectedRepo: "org/repo",
      inputRepo: "org/repo",
      lastRun: { repo: "org/repo", updatedAt: "2026-07-17T00:00:00Z" },
    });
    expect(deriveScopeSettings).toHaveBeenCalledWith({
      filterPrNumbersRaw: "123",
      scopeModeValue: "last-run",
      optionsUseLastRunScope: true,
    });
    expect(getNeedsAttentionConfig).toHaveBeenCalled();
    expect(deriveRowSources).toHaveBeenCalledWith({
      allEntries: [{ id: 1 }],
      repoFilter: "org/repo",
    });
    expect(result).toEqual({
      sectionsHost: { id: "sections" },
      insightsViewState: { expanded: ["1"] },
      prSectionOpenState: { opened: true },
      meta: { textContent: "" },
      scopeSelect: { value: "last-run" },
      allEntries: [{ id: 1 }],
      lastRun: { repo: "org/repo", updatedAt: "2026-07-17T00:00:00Z" },
      repoFilter: "org/repo",
      runStamp: "2026-07-17T00:00:00Z",
      normalizedRunStamp: "2026-07-17T00:00:00Z",
      filterPrNumbersRaw: "123",
      filterPrNumbers: ["123"],
      selectedScope: "last-run",
      ignoreScopeForPrNumberFilter: true,
      useLastRunScope: true,
      attentionConfig: { enabled: true },
      rowsForRepo: [{ id: 1 }],
      allStoredRows: [{ id: 1 }, { id: 2 }],
    });
  });

  test("given missing dependencies and invalid raw filter input, when deriving run-pr-data context, then safe defaults are returned", () => {
    const { deriveRunPrDataContext } = createPrRunPrDataContextHelpers();

    const result = deriveRunPrDataContext({
      filterPrNumbersRaw: 123,
    });

    expect(result.filterPrNumbersRaw).toBe("");
    expect(result.repoFilter).toBe("");
    expect(result.filterPrNumbers).toEqual([]);
    expect(result.selectedScope).toBe("all");
    expect(result.rowsForRepo).toEqual([]);
    expect(result.allStoredRows).toEqual([]);
  });
});
