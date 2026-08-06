(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsMergedRequestMoreConfigHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
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
});
