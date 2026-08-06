(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRepoRunContextHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
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
});
