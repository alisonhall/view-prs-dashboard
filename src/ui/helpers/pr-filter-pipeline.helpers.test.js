/** @jest-environment jsdom */

const {
  createPrFilterPipelineHelpers,
} = require("./pr-filter-pipeline.helpers.js");

describe("pr filter pipeline helpers", () => {
  test("given selected filters and candidate rows, when deriving filter pipeline state, then selected view-model and filtered rows are returned", () => {
    const buildSelectedFiltersViewModel = jest.fn(() => ({
      selectedAuthorLogins: ["author-1"],
      selectedAssignedLogins: ["assigned-1"],
      selectedApproverLogins: ["approver-1"],
      includeLabelFilter: "bug",
      excludeLabelFilter: "wip",
      authorFilter: "author-1",
      assignedFilter: "assigned-1",
      approverFilter: "approver-1",
      includeLabels: ["bug"],
      excludeLabels: ["wip"],
      openModeFilter: "ready",
      alwaysShowInReview: true,
    }));
    const buildRowFilterCriteria = jest.fn(() => ({ criteria: true }));
    const applyRowUiFilters = jest.fn(() => [{ id: 2 }]);
    const { deriveFilterPipelineState } = createPrFilterPipelineHelpers({
      buildSelectedFiltersViewModel,
      buildRowFilterCriteria,
      applyRowUiFilters,
    });

    const result = deriveFilterPipelineState({
      rows: [{ id: 1 }, { id: 2 }],
      filterPrNumbers: [123],
      selectedIncludeLabelNames: ["bug"],
      selectedExcludeLabelNames: ["wip"],
      selectedAuthorLogins: ["author-1"],
      selectedAssignedLogins: ["assigned-1"],
      selectedApproverLogins: ["approver-1"],
      openModeFilter: "ready",
      alwaysShowInReview: true,
    });

    expect(buildSelectedFiltersViewModel).toHaveBeenCalledWith({
      selectedIncludeLabelNames: ["bug"],
      selectedExcludeLabelNames: ["wip"],
      selectedAuthorLogins: ["author-1"],
      selectedAssignedLogins: ["assigned-1"],
      selectedApproverLogins: ["approver-1"],
      openModeFilter: "ready",
      alwaysShowInReview: true,
    });
    expect(buildRowFilterCriteria).toHaveBeenCalledWith({
      prNumbers: [123],
      includeLabels: ["bug"],
      excludeLabels: ["wip"],
      authorLogins: ["author-1"],
      assignedLogins: ["assigned-1"],
      approverLogins: ["approver-1"],
      alwaysShowInReview: true,
    });
    expect(applyRowUiFilters).toHaveBeenCalledWith(
      [{ id: 1 }, { id: 2 }],
      { criteria: true },
    );
    expect(result).toEqual({
      selectedAuthorLogins: ["author-1"],
      selectedAssignedLogins: ["assigned-1"],
      selectedApproverLogins: ["approver-1"],
      includeLabelFilter: "bug",
      excludeLabelFilter: "wip",
      authorFilter: "author-1",
      assignedFilter: "assigned-1",
      approverFilter: "approver-1",
      includeLabels: ["bug"],
      excludeLabels: ["wip"],
      openModeFilter: "ready",
      alwaysShowInReview: true,
      rows: [{ id: 2 }],
    });
  });

  test("given invalid rows input, when deriving filter pipeline state, then an empty row list is passed to filtering", () => {
    const applyRowUiFilters = jest.fn(() => []);
    const { deriveFilterPipelineState } = createPrFilterPipelineHelpers({
      buildSelectedFiltersViewModel: () => ({
        selectedAuthorLogins: [],
        selectedAssignedLogins: [],
        selectedApproverLogins: [],
        includeLabelFilter: "",
        excludeLabelFilter: "",
        authorFilter: "",
        assignedFilter: "",
        approverFilter: "",
        includeLabels: [],
        excludeLabels: [],
        openModeFilter: "none",
        alwaysShowInReview: false,
      }),
      buildRowFilterCriteria: () => ({}),
      applyRowUiFilters,
    });

    deriveFilterPipelineState({
      rows: null,
      filterPrNumbers: [],
    });

    expect(applyRowUiFilters).toHaveBeenCalledWith([], {});
  });

  test("given missing dependencies, when deriving filter pipeline state, then safe defaults are returned", () => {
    const { deriveFilterPipelineState } = createPrFilterPipelineHelpers();

    const result = deriveFilterPipelineState({
      rows: [{ id: 1 }],
    });

    expect(result).toEqual({
      selectedIncludeLabelNames: [],
      selectedExcludeLabelNames: [],
      selectedAuthorLogins: [],
      selectedAssignedLogins: [],
      selectedApproverLogins: [],
      includeLabelFilter: "",
      excludeLabelFilter: "",
      authorFilter: "",
      assignedFilter: "",
      approverFilter: "",
      includeLabels: [],
      excludeLabels: [],
      openModeFilter: "none",
      alwaysShowInReview: false,
      rows: [{ id: 1 }],
    });
  });
});
