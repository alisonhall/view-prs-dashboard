(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsSelectedFiltersHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrSelectedFiltersHelpers = () => {
    const asArray = (value) => (Array.isArray(value) ? value : []);

    const buildSelectedFiltersViewModel = ({
      selectedIncludeLabelNames,
      selectedExcludeLabelNames,
      selectedAuthorLogins,
      selectedAssignedLogins,
      selectedApproverLogins,
      openModeFilter,
      alwaysShowInReview,
    } = {}) => {
      const includeLabelNames = asArray(selectedIncludeLabelNames);
      const excludeLabelNames = asArray(selectedExcludeLabelNames);
      const authorLogins = asArray(selectedAuthorLogins);
      const assignedLogins = asArray(selectedAssignedLogins);
      const approverLogins = asArray(selectedApproverLogins);

      return {
        selectedIncludeLabelNames: includeLabelNames,
        selectedExcludeLabelNames: excludeLabelNames,
        selectedAuthorLogins: authorLogins,
        selectedAssignedLogins: assignedLogins,
        selectedApproverLogins: approverLogins,
        includeLabelFilter: includeLabelNames.join(", "),
        excludeLabelFilter: excludeLabelNames.join(", "),
        authorFilter: authorLogins.join(", "),
        assignedFilter: assignedLogins.join(", "),
        approverFilter: approverLogins.join(", "),
        includeLabels: [...includeLabelNames],
        excludeLabels: [...excludeLabelNames],
        openModeFilter: openModeFilter || "none",
        alwaysShowInReview: Boolean(alwaysShowInReview),
      };
    };

    return {
      buildSelectedFiltersViewModel,
    };
  };

  return {
    createPrSelectedFiltersHelpers,
  };
});
