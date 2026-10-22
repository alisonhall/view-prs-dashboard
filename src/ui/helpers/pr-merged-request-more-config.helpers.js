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

export { createPrMergedRequestMoreConfigHelpers };
