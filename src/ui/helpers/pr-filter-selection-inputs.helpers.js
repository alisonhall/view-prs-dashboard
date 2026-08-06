(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsFilterSelectionInputsHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrFilterSelectionInputsHelpers = ({
    getSelectedIncludeLabelNames,
    getSelectedExcludeLabelNames,
    getSelectedAuthorLogins,
    getSelectedAssignedLogins,
    getSelectedApproverLogins,
    getOpenModeFilter,
    shouldAlwaysShowInReviewRows,
  } = {}) => {
    const getSelectedIncludeLabelNamesSafe =
      typeof getSelectedIncludeLabelNames === "function"
        ? getSelectedIncludeLabelNames
        : () => [];
    const getSelectedExcludeLabelNamesSafe =
      typeof getSelectedExcludeLabelNames === "function"
        ? getSelectedExcludeLabelNames
        : () => [];
    const getSelectedAuthorLoginsSafe =
      typeof getSelectedAuthorLogins === "function"
        ? getSelectedAuthorLogins
        : () => [];
    const getSelectedAssignedLoginsSafe =
      typeof getSelectedAssignedLogins === "function"
        ? getSelectedAssignedLogins
        : () => [];
    const getSelectedApproverLoginsSafe =
      typeof getSelectedApproverLogins === "function"
        ? getSelectedApproverLogins
        : () => [];
    const getOpenModeFilterSafe =
      typeof getOpenModeFilter === "function" ? getOpenModeFilter : () => "none";
    const shouldAlwaysShowInReviewRowsSafe =
      typeof shouldAlwaysShowInReviewRows === "function"
        ? shouldAlwaysShowInReviewRows
        : () => false;

    const deriveFilterSelectionInputs = () => ({
      selectedIncludeLabelNames: getSelectedIncludeLabelNamesSafe(),
      selectedExcludeLabelNames: getSelectedExcludeLabelNamesSafe(),
      selectedAuthorLogins: getSelectedAuthorLoginsSafe(),
      selectedAssignedLogins: getSelectedAssignedLoginsSafe(),
      selectedApproverLogins: getSelectedApproverLoginsSafe(),
      openModeFilter: getOpenModeFilterSafe() || "none",
      alwaysShowInReview: Boolean(shouldAlwaysShowInReviewRowsSafe()),
    });

    return {
      deriveFilterSelectionInputs,
    };
  };

  return {
    createPrFilterSelectionInputsHelpers,
  };
});
