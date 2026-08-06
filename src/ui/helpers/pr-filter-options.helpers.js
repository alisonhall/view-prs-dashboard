(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsFilterOptionsHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrFilterOptionsHelpers = ({
    populateIncludeLabelOptions,
    populateExcludeLabelOptions,
    populateAuthorOptions,
    populateAssignedOptions,
    populateApproverOptions,
    populateAuthorThreadResolutionActorOptions,
  } = {}) => {
    const populateIncludeLabelOptionsSafe =
      typeof populateIncludeLabelOptions === "function"
        ? populateIncludeLabelOptions
        : () => {};
    const populateExcludeLabelOptionsSafe =
      typeof populateExcludeLabelOptions === "function"
        ? populateExcludeLabelOptions
        : () => {};
    const populateAuthorOptionsSafe =
      typeof populateAuthorOptions === "function" ? populateAuthorOptions : () => {};
    const populateAssignedOptionsSafe =
      typeof populateAssignedOptions === "function" ? populateAssignedOptions : () => {};
    const populateApproverOptionsSafe =
      typeof populateApproverOptions === "function" ? populateApproverOptions : () => {};
    const populateAuthorThreadResolutionActorOptionsSafe =
      typeof populateAuthorThreadResolutionActorOptions === "function"
        ? populateAuthorThreadResolutionActorOptions
        : () => {};

    const populateFilterOptions = ({ entries, repoFilter, actorsMap } = {}) => {
      const safeEntries = Array.isArray(entries) ? entries : [];
      const safeRepoFilter = typeof repoFilter === "string" ? repoFilter : "";
      const safeActorsMap = actorsMap && typeof actorsMap === "object" ? actorsMap : {};

      populateIncludeLabelOptionsSafe(safeEntries, safeRepoFilter);
      populateExcludeLabelOptionsSafe(safeEntries, safeRepoFilter);
      populateAuthorOptionsSafe(safeEntries, safeRepoFilter, safeActorsMap);
      populateAssignedOptionsSafe(safeEntries, safeRepoFilter, safeActorsMap);
      populateApproverOptionsSafe(safeEntries, safeRepoFilter, safeActorsMap);
      populateAuthorThreadResolutionActorOptionsSafe(safeActorsMap);
    };

    return {
      populateFilterOptions,
    };
  };

  return {
    createPrFilterOptionsHelpers,
  };
});
