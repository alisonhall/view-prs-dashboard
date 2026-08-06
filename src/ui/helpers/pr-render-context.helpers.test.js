/** @jest-environment jsdom */

const {
  createPrRenderContextHelpers,
} = require("./pr-render-context.helpers.js");

describe("pr render context helpers", () => {
  test("given payload and dom lookups, when capturing render context, then context contains expected elements and payload fields", () => {
    const elements = {
      "pr-sections": { id: "pr-sections" },
      "data-meta": { id: "data-meta" },
      "scope-mode": { id: "scope-mode" },
    };
    const getElementById = jest.fn((id) => elements[id] || null);
    const captureInsightsViewState = jest.fn(() => ({ expanded: new Set(["1"]) }));
    const capturePrSectionOpenState = jest.fn(() => new Map([["open", true]]));

    const { captureRenderContext } = createPrRenderContextHelpers({
      getElementById,
      captureInsightsViewState,
      capturePrSectionOpenState,
    });

    const context = captureRenderContext({
      byPrNumber: {
        "101": { prNumber: 101 },
        "102": { prNumber: 102 },
      },
      lastRun: { repo: "org/repo", updatedAt: "run-stamp" },
    });

    expect(context.sectionsHost).toEqual({ id: "pr-sections" });
    expect(context.meta).toEqual({ id: "data-meta" });
    expect(context.scopeSelect).toEqual({ id: "scope-mode" });
    expect(context.byPrNumber).toEqual({
      "101": { prNumber: 101 },
      "102": { prNumber: 102 },
    });
    expect(context.allEntries).toEqual([{ prNumber: 101 }, { prNumber: 102 }]);
    expect(context.lastRun).toEqual({ repo: "org/repo", updatedAt: "run-stamp" });
    expect(captureInsightsViewState).toHaveBeenCalledWith({ id: "pr-sections" });
    expect(capturePrSectionOpenState).toHaveBeenCalledWith({ id: "pr-sections" });
  });

  test("given missing payload fields, when capturing render context, then defaults are returned", () => {
    const { captureRenderContext } = createPrRenderContextHelpers({
      getElementById: () => null,
      captureInsightsViewState: () => ({ expanded: new Set() }),
      capturePrSectionOpenState: () => new Map(),
    });

    const context = captureRenderContext({});

    expect(context.byPrNumber).toEqual({});
    expect(context.allEntries).toEqual([]);
    expect(context.lastRun).toBeNull();
  });
});
