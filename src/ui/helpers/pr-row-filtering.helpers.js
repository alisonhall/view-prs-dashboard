(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRowFilteringHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrRowFilteringHelpers = ({ rowMatchesUiFilters } = {}) => {
    const rowMatchesUiFiltersSafe =
      typeof rowMatchesUiFilters === "function"
        ? rowMatchesUiFilters
        : () => true;

    const buildRowFilterCriteria = ({
      prNumbers,
      includeLabels,
      excludeLabels,
      authorLogins,
      assignedLogins,
      approverLogins,
      alwaysShowInReview,
      customComments,
      otherNotes,
      prDifficulty,
      rallyStories,
      rallyLinks,
      analysisOfPr,
    } = {}) => ({
      prNumbers: Array.isArray(prNumbers) ? prNumbers : [],
      includeLabels: Array.isArray(includeLabels) ? includeLabels : [],
      excludeLabels: Array.isArray(excludeLabels) ? excludeLabels : [],
      authorLogins: Array.isArray(authorLogins) ? authorLogins : [],
      assignedLogins: Array.isArray(assignedLogins) ? assignedLogins : [],
      approverLogins: Array.isArray(approverLogins) ? approverLogins : [],
      alwaysShowInReview: Boolean(alwaysShowInReview),
      customComments: String(customComments || ""),
      otherNotes: String(otherNotes || ""),
      prDifficulty: String(prDifficulty || ""),
      rallyStories: String(rallyStories || ""),
      rallyLinks: String(rallyLinks || ""),
      analysisOfPr: String(analysisOfPr || ""),
    });

    const applyRowUiFilters = (rows, criteria) => {
      const safeRows = Array.isArray(rows) ? rows : [];
      return safeRows.filter((entry) => rowMatchesUiFiltersSafe(entry, criteria));
    };

    return {
      buildRowFilterCriteria,
      applyRowUiFilters,
    };
  };

  return {
    createPrRowFilteringHelpers,
  };
});
