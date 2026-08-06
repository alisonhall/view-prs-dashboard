/** @jest-environment jsdom */

const {
  createPrFilterSelectionInputsHelpers,
} = require("./pr-filter-selection-inputs.helpers.js");

describe("pr filter selection inputs helpers", () => {
  test("given available selected filter getters, when deriving filter selection inputs, then all selected inputs are returned", () => {
    const { deriveFilterSelectionInputs } = createPrFilterSelectionInputsHelpers({
      getSelectedIncludeLabelNames: () => ["bug", "urgent"],
      getSelectedExcludeLabelNames: () => ["wip"],
      getSelectedAuthorLogins: () => ["author-1"],
      getSelectedAssignedLogins: () => ["assigned-1"],
      getSelectedApproverLogins: () => ["approver-1"],
      getOpenModeFilter: () => "ready",
      shouldAlwaysShowInReviewRows: () => true,
    });

    expect(deriveFilterSelectionInputs()).toEqual({
      selectedIncludeLabelNames: ["bug", "urgent"],
      selectedExcludeLabelNames: ["wip"],
      selectedAuthorLogins: ["author-1"],
      selectedAssignedLogins: ["assigned-1"],
      selectedApproverLogins: ["approver-1"],
      openModeFilter: "ready",
      alwaysShowInReview: true,
    });
  });

  test("given empty open-mode getter response, when deriving filter selection inputs, then open-mode falls back to none", () => {
    const { deriveFilterSelectionInputs } = createPrFilterSelectionInputsHelpers({
      getSelectedIncludeLabelNames: () => [],
      getSelectedExcludeLabelNames: () => [],
      getSelectedAuthorLogins: () => [],
      getSelectedAssignedLogins: () => [],
      getSelectedApproverLogins: () => [],
      getOpenModeFilter: () => "",
      shouldAlwaysShowInReviewRows: () => false,
    });

    expect(deriveFilterSelectionInputs()).toEqual({
      selectedIncludeLabelNames: [],
      selectedExcludeLabelNames: [],
      selectedAuthorLogins: [],
      selectedAssignedLogins: [],
      selectedApproverLogins: [],
      openModeFilter: "none",
      alwaysShowInReview: false,
    });
  });

  test("given missing dependencies, when deriving filter selection inputs, then safe defaults are returned", () => {
    const { deriveFilterSelectionInputs } = createPrFilterSelectionInputsHelpers();

    expect(deriveFilterSelectionInputs()).toEqual({
      selectedIncludeLabelNames: [],
      selectedExcludeLabelNames: [],
      selectedAuthorLogins: [],
      selectedAssignedLogins: [],
      selectedApproverLogins: [],
      openModeFilter: "none",
      alwaysShowInReview: false,
    });
  });
});
