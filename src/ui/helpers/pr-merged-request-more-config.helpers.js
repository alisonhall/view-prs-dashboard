// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsMergedRequestMoreConfigHelpers fallback.
export const { createPrMergedRequestMoreConfigHelpers } = (() => {
  const createPrMergedRequestMoreConfigHelpers = () => {
    const buildMergedRequestMoreActionOptions = ({
      selectedScope,
      repoFilter,
      lastRunRepo,
      latestSelectedRepo,
    } = {}) => ({
      isVisible: selectedScope === "all",
      repo: repoFilter || lastRunRepo || latestSelectedRepo || "",
    });

    return {
      buildMergedRequestMoreActionOptions,
    };
  };

  return {
    createPrMergedRequestMoreConfigHelpers,
  };
})();
