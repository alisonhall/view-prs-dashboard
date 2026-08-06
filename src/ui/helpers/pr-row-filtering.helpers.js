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
    } = {}) => ({
      prNumbers: Array.isArray(prNumbers) ? prNumbers : [],
      includeLabels: Array.isArray(includeLabels) ? includeLabels : [],
      excludeLabels: Array.isArray(excludeLabels) ? excludeLabels : [],
      authorLogins: Array.isArray(authorLogins) ? authorLogins : [],
      assignedLogins: Array.isArray(assignedLogins) ? assignedLogins : [],
      approverLogins: Array.isArray(approverLogins) ? approverLogins : [],
      alwaysShowInReview: Boolean(alwaysShowInReview),
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
