// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsFilterPipelineHelpers fallback.
export const { createPrFilterPipelineHelpers } = (() => {
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
      customComments,
      otherNotes,
      prDifficulty,
      rallyStories,
      rallyLinks,
      analysisOfPr,
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
        customComments,
        otherNotes,
        prDifficulty,
        rallyStories,
        rallyLinks,
        analysisOfPr,
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
})();
