// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsApplyFiltersCacheHelpers fallback.
export const { createPrApplyFiltersCacheHelpers } = (() => {
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
})();
