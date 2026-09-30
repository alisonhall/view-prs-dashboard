// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsSelectedFiltersHelpers fallback.
export const { createPrSelectedFiltersHelpers } = (() => {
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
})();
