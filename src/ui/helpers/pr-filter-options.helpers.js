// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsFilterOptionsHelpers fallback.
export const { createPrFilterOptionsHelpers } = (() => {
  const createPrFilterOptionsHelpers = ({
    populateIncludeLabelOptions,
    populateExcludeLabelOptions,
    populateAuthorOptions,
    populateAssignedOptions,
    populateApproverOptions,
    populateAuthorThreadResolutionActorOptions,
    populateChangeFilterActorOptions,
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
    const populateChangeFilterActorOptionsSafe =
      typeof populateChangeFilterActorOptions === "function"
        ? populateChangeFilterActorOptions
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
      populateChangeFilterActorOptionsSafe(safeActorsMap);
    };

    return {
      populateFilterOptions,
    };
  };

  return {
    createPrFilterOptionsHelpers,
  };
})();
