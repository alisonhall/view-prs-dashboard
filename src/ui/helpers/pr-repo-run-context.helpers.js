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

export { createPrRepoRunContextHelpers };
