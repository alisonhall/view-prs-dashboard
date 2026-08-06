/** @jest-environment jsdom */

const {
  createPrRenderSummaryInputsHelpers,
} = require("./pr-render-summary-inputs.helpers.js");

describe("pr render summary inputs helpers", () => {
  test("given render summary source values, when deriving render summary inputs, then normalized summary inputs are returned", () => {
    const { deriveRenderSummaryInputs } = createPrRenderSummaryInputsHelpers();
    const payload = { scheduler: { intervalMinutes: 15 } };

    const result = deriveRenderSummaryInputs({
      rows: [{ id: 1 }],
      payload,
      repoFilter: "org/repo",
      scopeLabel: "last run rows",
      filterPrNumbersRaw: "123,456",
      includeLabelFilter: "bug",
      excludeLabelFilter: "wip",
      authorFilter: "author-1",
      assignedFilter: "assigned-1",
      approverFilter: "approver-1",
      alwaysShowInReview: true,
      openModeFilter: "ready",
    });

    expect(result).toEqual({
      rows: [{ id: 1 }],
      payload,
      repoFilter: "org/repo",
      scopeLabel: "last run rows",
      filterPrNumbersRaw: "123,456",
      includeLabelFilter: "bug",
      excludeLabelFilter: "wip",
      authorFilter: "author-1",
      assignedFilter: "assigned-1",
      approverFilter: "approver-1",
      alwaysShowInReview: true,
      openModeFilter: "ready",
    });
  });

  test("given invalid summary source values, when deriving render summary inputs, then safe defaults are used", () => {
    const { deriveRenderSummaryInputs } = createPrRenderSummaryInputsHelpers();

    const result = deriveRenderSummaryInputs({
      rows: null,
      payload: 42,
      repoFilter: null,
      scopeLabel: undefined,
      filterPrNumbersRaw: 999,
      includeLabelFilter: false,
      excludeLabelFilter: 1,
      authorFilter: null,
      assignedFilter: undefined,
      approverFilter: 0,
      alwaysShowInReview: "",
      openModeFilter: "",
    });

    expect(result).toEqual({
      rows: [],
      payload: null,
      repoFilter: "",
      scopeLabel: "",
      filterPrNumbersRaw: "",
      includeLabelFilter: "",
      excludeLabelFilter: "",
      authorFilter: "",
      assignedFilter: "",
      approverFilter: "",
      alwaysShowInReview: false,
      openModeFilter: "none",
    });
  });
});
