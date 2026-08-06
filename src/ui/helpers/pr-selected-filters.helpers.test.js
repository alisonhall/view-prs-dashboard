/** @jest-environment jsdom */

const {
  createPrSelectedFiltersHelpers,
} = require("./pr-selected-filters.helpers.js");

describe("pr selected filters helpers", () => {
  test("given selected filter arrays, when building selected filters view model, then joined filter strings are returned", () => {
    const { buildSelectedFiltersViewModel } = createPrSelectedFiltersHelpers();

    const viewModel = buildSelectedFiltersViewModel({
      selectedIncludeLabelNames: ["bug", "frontend"],
      selectedExcludeLabelNames: ["wip"],
      selectedAuthorLogins: ["alice"],
      selectedAssignedLogins: ["bob"],
      selectedApproverLogins: ["carol"],
      openModeFilter: "in-review",
      alwaysShowInReview: true,
    });

    expect(viewModel.includeLabelFilter).toBe("bug, frontend");
    expect(viewModel.excludeLabelFilter).toBe("wip");
    expect(viewModel.authorFilter).toBe("alice");
    expect(viewModel.assignedFilter).toBe("bob");
    expect(viewModel.approverFilter).toBe("carol");
    expect(viewModel.openModeFilter).toBe("in-review");
    expect(viewModel.alwaysShowInReview).toBe(true);
  });

  test("given include and exclude arrays, when building selected filters view model, then includeLabels and excludeLabels are cloned", () => {
    const { buildSelectedFiltersViewModel } = createPrSelectedFiltersHelpers();
    const include = ["bug"];
    const exclude = ["wip"];

    const viewModel = buildSelectedFiltersViewModel({
      selectedIncludeLabelNames: include,
      selectedExcludeLabelNames: exclude,
    });

    expect(viewModel.includeLabels).toEqual(["bug"]);
    expect(viewModel.excludeLabels).toEqual(["wip"]);
    expect(viewModel.includeLabels).not.toBe(include);
    expect(viewModel.excludeLabels).not.toBe(exclude);
  });

  test("given missing filter arrays and open mode, when building selected filters view model, then defaults are applied", () => {
    const { buildSelectedFiltersViewModel } = createPrSelectedFiltersHelpers();

    const viewModel = buildSelectedFiltersViewModel();

    expect(viewModel.selectedIncludeLabelNames).toEqual([]);
    expect(viewModel.selectedExcludeLabelNames).toEqual([]);
    expect(viewModel.selectedAuthorLogins).toEqual([]);
    expect(viewModel.selectedAssignedLogins).toEqual([]);
    expect(viewModel.selectedApproverLogins).toEqual([]);
    expect(viewModel.includeLabelFilter).toBe("");
    expect(viewModel.excludeLabelFilter).toBe("");
    expect(viewModel.authorFilter).toBe("");
    expect(viewModel.assignedFilter).toBe("");
    expect(viewModel.approverFilter).toBe("");
    expect(viewModel.openModeFilter).toBe("none");
    expect(viewModel.alwaysShowInReview).toBe(false);
  });
});
