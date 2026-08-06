/** @jest-environment jsdom */

const {
  createPrRenderFilterSummaryHelpers,
} = require("./pr-render-filter-summary.helpers.js");

describe("pr render filter summary helpers", () => {
  test("given scoped rows and selected filters, when deriving render filter summary state, then filtered rows and grouped summary output are returned", () => {
    const deriveScopedRows = jest.fn(() => ({
      rows: [{ number: 1 }, { number: 2 }],
      scopeLabel: "My Open PRs",
    }));
    const deriveFilterSelectionInputs = jest.fn(() => ({
      includeLabelFilter: ["frontend"],
      excludeLabelFilter: ["wip"],
      authorFilter: ["alice"],
      assignedFilter: ["bob"],
      approverFilter: ["carol"],
      openModeFilter: "current",
      alwaysShowInReview: true,
    }));
    const deriveFilterPipelineState = jest.fn(() => ({
      includeLabelFilter: ["frontend"],
      excludeLabelFilter: ["wip"],
      authorFilter: ["alice"],
      assignedFilter: ["bob"],
      approverFilter: ["carol"],
      openModeFilter: "current",
      alwaysShowInReview: true,
      rows: [{ number: 2 }],
    }));
    const deriveRenderSummaryInputs = jest.fn((inputs) => ({
      ...inputs,
      marker: "summary-inputs",
    }));
    const deriveRenderSummary = jest.fn(() => ({
      grouped: { opened: [{ number: 2 }], inReview: [], merged: [], closed: [] },
      appliedSummaryText: "Repo: org/repo",
      filterChips: ["author:alice"],
    }));

    const { deriveRenderFilterSummaryState } = createPrRenderFilterSummaryHelpers({
      deriveScopedRows,
      deriveFilterSelectionInputs,
      deriveFilterPipelineState,
      deriveRenderSummaryInputs,
      deriveRenderSummary,
    });

    const result = deriveRenderFilterSummaryState({
      rowsForRepo: [{ number: 1 }, { number: 2 }],
      ignoreScopeForPrNumberFilter: false,
      runStamp: "2026-07-17T00:00:00.000Z",
      useLastRunScope: false,
      selectedScope: "mine",
      attentionConfig: { isEnabled: true },
      filterPrNumbers: [2],
      payload: { scheduler: { enabled: true } },
      repoFilter: "org/repo",
      filterPrNumbersRaw: "2",
    });

    expect(deriveScopedRows).toHaveBeenCalledWith({
      rowsForRepo: [{ number: 1 }, { number: 2 }],
      ignoreScopeForPrNumberFilter: false,
      runStamp: "2026-07-17T00:00:00.000Z",
      useLastRunScope: false,
      selectedScope: "mine",
      attentionConfig: { isEnabled: true },
    });
    expect(deriveFilterSelectionInputs).toHaveBeenCalledTimes(1);
    expect(deriveFilterPipelineState).toHaveBeenCalledWith({
      rows: [{ number: 1 }, { number: 2 }],
      filterPrNumbers: [2],
      includeLabelFilter: ["frontend"],
      excludeLabelFilter: ["wip"],
      authorFilter: ["alice"],
      assignedFilter: ["bob"],
      approverFilter: ["carol"],
      openModeFilter: "current",
      alwaysShowInReview: true,
    });
    expect(deriveRenderSummaryInputs).toHaveBeenCalledWith({
      rows: [{ number: 2 }],
      payload: { scheduler: { enabled: true } },
      repoFilter: "org/repo",
      scopeLabel: "My Open PRs",
      filterPrNumbersRaw: "2",
      includeLabelFilter: ["frontend"],
      excludeLabelFilter: ["wip"],
      authorFilter: ["alice"],
      assignedFilter: ["bob"],
      approverFilter: ["carol"],
      alwaysShowInReview: true,
      openModeFilter: "current",
    });
    expect(deriveRenderSummary).toHaveBeenCalledWith({
      rows: [{ number: 2 }],
      payload: { scheduler: { enabled: true } },
      repoFilter: "org/repo",
      scopeLabel: "My Open PRs",
      filterPrNumbersRaw: "2",
      includeLabelFilter: ["frontend"],
      excludeLabelFilter: ["wip"],
      authorFilter: ["alice"],
      assignedFilter: ["bob"],
      approverFilter: ["carol"],
      alwaysShowInReview: true,
      openModeFilter: "current",
      marker: "summary-inputs",
    });
    expect(result).toEqual({
      rows: [{ number: 2 }],
      grouped: { opened: [{ number: 2 }], inReview: [], merged: [], closed: [] },
      appliedSummaryText: "Repo: org/repo",
      filterChips: ["author:alice"],
    });
  });

  test("given filter pipeline omits rows, when deriving render filter summary state, then rows fallback to an empty list", () => {
    const { deriveRenderFilterSummaryState } = createPrRenderFilterSummaryHelpers({
      deriveScopedRows: () => ({ rows: [{ number: 3 }], scopeLabel: "All" }),
      deriveFilterSelectionInputs: () => ({
        includeLabelFilter: [],
        excludeLabelFilter: [],
        authorFilter: [],
        assignedFilter: [],
        approverFilter: [],
        openModeFilter: "none",
        alwaysShowInReview: false,
      }),
      deriveFilterPipelineState: () => ({
        includeLabelFilter: [],
        excludeLabelFilter: [],
        authorFilter: [],
        assignedFilter: [],
        approverFilter: [],
        openModeFilter: "none",
        alwaysShowInReview: false,
      }),
      deriveRenderSummaryInputs: (inputs) => inputs,
      deriveRenderSummary: () => ({ grouped: {}, appliedSummaryText: "", filterChips: [] }),
    });

    const result = deriveRenderFilterSummaryState({
      rowsForRepo: [{ number: 3 }],
      filterPrNumbers: [],
    });

    expect(result.rows).toEqual([]);
  });

  test("given missing dependencies, when deriving render filter summary state, then safe default output is returned", () => {
    const { deriveRenderFilterSummaryState } = createPrRenderFilterSummaryHelpers();

    expect(
      deriveRenderFilterSummaryState({
        rowsForRepo: null,
      }),
    ).toEqual({
      rows: [],
      grouped: { opened: [], inReview: [], merged: [], closed: [] },
      appliedSummaryText: "",
      filterChips: [],
    });
  });
});
