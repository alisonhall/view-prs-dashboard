(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsFilterPipelineHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrFilterPipelineHelpers = ({
    buildSelectedFiltersViewModel,
    buildRowFilterCriteria,
    applyRowUiFilters,
  } = {}) => {
    const buildSelectedFiltersViewModelSafe =
      typeof buildSelectedFiltersViewModel === "function"
        ? buildSelectedFiltersViewModel
        : () => ({
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
          });
    const buildRowFilterCriteriaSafe =
      typeof buildRowFilterCriteria === "function"
        ? buildRowFilterCriteria
        : () => ({
            prNumbers: [],
            includeLabels: [],
            excludeLabels: [],
            authorLogins: [],
            assignedLogins: [],
            approverLogins: [],
            alwaysShowInReview: false,
          });
    const applyRowUiFiltersSafe =
      typeof applyRowUiFilters === "function" ? applyRowUiFilters : (rows) => rows;

    const deriveFilterPipelineState = ({
      rows,
      filterPrNumbers,
      selectedIncludeLabelNames,
      selectedExcludeLabelNames,
      selectedAuthorLogins,
      selectedAssignedLogins,
      selectedApproverLogins,
      openModeFilter,
      alwaysShowInReview,
    } = {}) => {
      const safeRows = Array.isArray(rows) ? rows : [];
      const selectedFilters = buildSelectedFiltersViewModelSafe({
        selectedIncludeLabelNames,
        selectedExcludeLabelNames,
        selectedAuthorLogins,
        selectedAssignedLogins,
        selectedApproverLogins,
        openModeFilter,
        alwaysShowInReview,
      });

      const rowFilterCriteria = buildRowFilterCriteriaSafe({
        prNumbers: filterPrNumbers,
        includeLabels: selectedFilters.includeLabels,
        excludeLabels: selectedFilters.excludeLabels,
        authorLogins: selectedFilters.selectedAuthorLogins,
        assignedLogins: selectedFilters.selectedAssignedLogins,
        approverLogins: selectedFilters.selectedApproverLogins,
        alwaysShowInReview: selectedFilters.alwaysShowInReview,
      });

      return {
        ...selectedFilters,
        rows: applyRowUiFiltersSafe(safeRows, rowFilterCriteria),
      };
    };

    return {
      deriveFilterPipelineState,
    };
  };

  return {
    createPrFilterPipelineHelpers,
  };
});
