(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsApplyFiltersCacheHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrApplyFiltersCacheHelpers = ({
    getLatestStoredPayload,
    getLatestSelectedRepo,
    renderPrData,
    setStatusMessage,
    logError,
  } = {}) => {
    const getLatestStoredPayloadSafe =
      typeof getLatestStoredPayload === "function"
        ? getLatestStoredPayload
        : () => null;
    const getLatestSelectedRepoSafe =
      typeof getLatestSelectedRepo === "function"
        ? getLatestSelectedRepo
        : () => "";
    const renderPrDataSafe =
      typeof renderPrData === "function" ? renderPrData : () => {};
    const setStatusMessageSafe =
      typeof setStatusMessage === "function" ? setStatusMessage : () => {};
    const logErrorSafe = typeof logError === "function" ? logError : () => {};

    const applyFiltersFromCache = () => {
      try {
        const latestStoredPayload = getLatestStoredPayloadSafe();
        if (!latestStoredPayload) {
          return;
        }
        renderPrDataSafe(latestStoredPayload, getLatestSelectedRepoSafe());
        setStatusMessageSafe("Applied local filters from stored JSON");
      } catch (error) {
        logErrorSafe("Error applying filters from cache:", error);
        setStatusMessageSafe("Error applying filters");
      }
    };

    return {
      applyFiltersFromCache,
    };
  };

  return {
    createPrApplyFiltersCacheHelpers,
  };
});
