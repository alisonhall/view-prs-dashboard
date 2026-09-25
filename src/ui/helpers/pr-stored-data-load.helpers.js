// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsStoredDataLoadHelpers fallback.
export const { createPrStoredDataLoadHelpers } = (() => {
  const createPrStoredDataLoadHelpers = ({
    fetch,
    beginRequestActivity,
    setLastSeenDataVersion,
    setLastRenderedRunStamp,
    setLastSuccessfulRenderedCheckAt,
    setLatestStoredPayload,
    getLatestSelectedRepo,
    setLatestSelectedRepo,
    updateBackfillStatusFromPayload,
    renderPrData,
  } = {}) => {
    const fetchSafe = typeof fetch === "function" ? fetch : () => Promise.reject(new Error("fetch is not available"));
    const beginRequestActivitySafe =
      typeof beginRequestActivity === "function"
        ? beginRequestActivity
        : () => () => {};
    const setLastSeenDataVersionSafe =
      typeof setLastSeenDataVersion === "function" ? setLastSeenDataVersion : () => {};
    const setLastRenderedRunStampSafe =
      typeof setLastRenderedRunStamp === "function" ? setLastRenderedRunStamp : () => {};
    const setLastSuccessfulRenderedCheckAtSafe =
      typeof setLastSuccessfulRenderedCheckAt === "function"
        ? setLastSuccessfulRenderedCheckAt
        : () => {};
    const setLatestStoredPayloadSafe =
      typeof setLatestStoredPayload === "function" ? setLatestStoredPayload : () => {};
    const getLatestSelectedRepoSafe =
      typeof getLatestSelectedRepo === "function" ? getLatestSelectedRepo : () => "";
    const setLatestSelectedRepoSafe =
      typeof setLatestSelectedRepo === "function" ? setLatestSelectedRepo : () => {};
    const updateBackfillStatusFromPayloadSafe =
      typeof updateBackfillStatusFromPayload === "function"
        ? updateBackfillStatusFromPayload
        : () => {};
    const renderPrDataSafe = typeof renderPrData === "function" ? renderPrData : () => {};

    const loadStoredData = async (selectedRepo = "", options = {}) => {
      const finishActivity = beginRequestActivitySafe("dataLoad");
      try {
        const response = await fetchSafe("/view-prs/data");
        const result = await response.json();
        if (!response.ok || result.ok === false) {
          throw new Error(result.error || "Failed to fetch stored PR data");
        }

        const dataVersion = String(result?.dataMeta?.dataVersion || "").trim();
        if (dataVersion) {
          setLastSeenDataVersionSafe(dataVersion);
        }

        const updatedAt = String(result?.lastRun?.updatedAt || "").trim();
        if (updatedAt) {
          setLastRenderedRunStampSafe(result.lastRun.updatedAt);
          setLastSuccessfulRenderedCheckAtSafe(updatedAt);
        }

        setLatestStoredPayloadSafe(result);
        setLatestSelectedRepoSafe(selectedRepo || getLatestSelectedRepoSafe() || "");
        updateBackfillStatusFromPayloadSafe(result);
        renderPrDataSafe(result, selectedRepo, options);
        return result;
      } finally {
        finishActivity();
      }
    };

    return {
      loadStoredData,
    };
  };

  return {
    createPrStoredDataLoadHelpers,
  };
})();
