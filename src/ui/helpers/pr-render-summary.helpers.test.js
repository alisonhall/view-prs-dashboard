/** @jest-environment jsdom */

const {
  createPrRenderSummaryHelpers,
} = require("./pr-render-summary.helpers.js");

describe("pr render summary helpers", () => {
  test("given filtered rows and payload metadata, when deriving render summary, then grouped rows, scheduler status, and applied summary are returned", () => {
    const buildGroupedPrSections = jest.fn(() => ({
      opened: [{ id: 1 }],
      inReview: [],
      merged: [],
      closed: [],
    }));
    const buildAppliedSummaryViewModel = jest.fn(() => ({
      appliedSummaryText: "Applied filters: repo=org/repo",
      filterChips: ["repo=org/repo"],
    }));
    const renderSchedulerStatus = jest.fn();
    const { deriveRenderSummary } = createPrRenderSummaryHelpers({
      buildGroupedPrSections,
      buildAppliedSummaryViewModel,
      renderSchedulerStatus,
    });

    const result = deriveRenderSummary({
      rows: [{ id: 1 }],
      payload: {
        scheduler: { intervalMinutes: 5 },
        lastRun: { updatedAt: "2026-07-17T00:00:00Z" },
      },
      repoFilter: "org/repo",
      scopeLabel: "all stored rows",
      filterPrNumbersRaw: "123",
      includeLabelFilter: "bug",
      excludeLabelFilter: "wip",
      authorFilter: "user-a",
      assignedFilter: "user-b",
      approverFilter: "user-c",
      alwaysShowInReview: true,
      openModeFilter: "ready",
    });

    expect(buildGroupedPrSections).toHaveBeenCalledWith([{ id: 1 }]);
    expect(renderSchedulerStatus).toHaveBeenCalledWith({ intervalMinutes: 5 });
    expect(buildAppliedSummaryViewModel).toHaveBeenCalledWith({
      repoFilter: "org/repo",
      scopeLabel: "all stored rows",
      filterPrNumbersRaw: "123",
      includeLabelFilter: "bug",
      excludeLabelFilter: "wip",
      authorFilter: "user-a",
      assignedFilter: "user-b",
      approverFilter: "user-c",
      alwaysShowInReview: true,
      openModeFilter: "ready",
      rowsCount: 1,
      lastRunUpdatedAt: "2026-07-17T00:00:00Z",
      scheduler: { intervalMinutes: 5 },
    });
    expect(result).toEqual({
      grouped: {
        opened: [{ id: 1 }],
        inReview: [],
        merged: [],
        closed: [],
      },
      scheduler: { intervalMinutes: 5 },
      appliedSummaryText: "Applied filters: repo=org/repo",
      filterChips: ["repo=org/repo"],
    });
  });

  test("given missing payload and non-array rows, when deriving render summary, then defaults are used", () => {
    const buildAppliedSummaryViewModel = jest.fn(() => ({
      appliedSummaryText: "fallback",
      filterChips: [],
    }));
    const renderSchedulerStatus = jest.fn();
    const { deriveRenderSummary } = createPrRenderSummaryHelpers({
      buildGroupedPrSections: () => ({ opened: [], inReview: [], merged: [], closed: [] }),
      buildAppliedSummaryViewModel,
      renderSchedulerStatus,
    });

    const result = deriveRenderSummary({
      rows: null,
      payload: null,
      repoFilter: "",
      scopeLabel: "all stored rows",
      filterPrNumbersRaw: "",
      includeLabelFilter: "",
      excludeLabelFilter: "",
      authorFilter: "",
      assignedFilter: "",
      approverFilter: "",
      alwaysShowInReview: false,
      openModeFilter: "none",
    });

    expect(renderSchedulerStatus).toHaveBeenCalledWith({});
    expect(buildAppliedSummaryViewModel).toHaveBeenCalledWith(
      expect.objectContaining({
        rowsCount: 0,
        lastRunUpdatedAt: "-",
        scheduler: {},
      }),
    );
    expect(result.appliedSummaryText).toBe("fallback");
  });

  test("given missing dependencies, when deriving render summary, then no error is thrown and safe defaults are returned", () => {
    const { deriveRenderSummary } = createPrRenderSummaryHelpers();

    expect(() =>
      deriveRenderSummary({
        rows: [{ id: 1 }],
        payload: {},
      }),
    ).not.toThrow();

    expect(
      deriveRenderSummary({
        rows: [{ id: 1 }],
        payload: {},
      }),
    ).toEqual({
      grouped: { opened: [], inReview: [], merged: [], closed: [] },
      scheduler: {},
      appliedSummaryText: "",
      filterChips: [],
    });
  });
});
