// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsRepoRunContextHelpers fallback.
export const { createPrRepoRunContextHelpers } = (() => {
  const createPrRepoRunContextHelpers = () => {
    const deriveRepoRunContext = ({ selectedRepo, inputRepo, lastRun } = {}) => {
      const repoFilter =
        String(selectedRepo || "").trim() ||
        String(inputRepo || "").trim() ||
        String(lastRun?.repo || "").trim() ||
        "";
      const runStamp = String(lastRun?.updatedAt || "");
      const normalizedRunStamp = runStamp.trim();

      return {
        repoFilter,
        runStamp,
        normalizedRunStamp,
      };
    };

    return {
      deriveRepoRunContext,
    };
  };

  return {
    createPrRepoRunContextHelpers,
  };
})();
