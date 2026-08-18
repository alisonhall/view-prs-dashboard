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
    getCustomCommentsFilter,
    getOtherNotesFilter,
    getPrDifficultyFilter,
    getRallyStoriesFilter,
    getRallyLinksFilter,
    getAnalysisOfPrFilter,
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
    const getCustomCommentsFilterSafe =
      typeof getCustomCommentsFilter === "function"
        ? getCustomCommentsFilter
        : () => "";
    const getOtherNotesFilterSafe =
      typeof getOtherNotesFilter === "function" ? getOtherNotesFilter : () => "";
    const getPrDifficultyFilterSafe =
      typeof getPrDifficultyFilter === "function" ? getPrDifficultyFilter : () => "";
    const getRallyStoriesFilterSafe =
      typeof getRallyStoriesFilter === "function" ? getRallyStoriesFilter : () => "";
    const getRallyLinksFilterSafe =
      typeof getRallyLinksFilter === "function" ? getRallyLinksFilter : () => "";
    const getAnalysisOfPrFilterSafe =
      typeof getAnalysisOfPrFilter === "function" ? getAnalysisOfPrFilter : () => "";

    const deriveFilterSelectionInputs = () => ({
      selectedIncludeLabelNames: getSelectedIncludeLabelNamesSafe(),
      selectedExcludeLabelNames: getSelectedExcludeLabelNamesSafe(),
      selectedAuthorLogins: getSelectedAuthorLoginsSafe(),
      selectedAssignedLogins: getSelectedAssignedLoginsSafe(),
      selectedApproverLogins: getSelectedApproverLoginsSafe(),
      openModeFilter: getOpenModeFilterSafe() || "none",
      alwaysShowInReview: Boolean(shouldAlwaysShowInReviewRowsSafe()),
      customComments: getCustomCommentsFilterSafe(),
      otherNotes: getOtherNotesFilterSafe(),
      prDifficulty: getPrDifficultyFilterSafe(),
      rallyStories: getRallyStoriesFilterSafe(),
      rallyLinks: getRallyLinksFilterSafe(),
      analysisOfPr: getAnalysisOfPrFilterSafe(),
    });

    return {
      deriveFilterSelectionInputs,
    };
  };

  return {
    createPrFilterSelectionInputsHelpers,
  };
});
