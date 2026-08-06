(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsStoredDataLoadHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
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
});
