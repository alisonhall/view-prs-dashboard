(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsMergedRequestMoreActionHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrMergedRequestMoreActionHelpers = ({
    getIsRequestMoreMergedPending,
    setIsRequestMoreMergedPending,
    getLatestSelectedRepo,
    defaultRepo,
    getOptionalElementById,
    beginRequestActivity,
    postJson,
    setLatestStoredPayload,
    setLatestSelectedRepo,
    renderPrData,
    loadStoredData,
    setStatusMessage,
    notifyFailureSnackbar,
  } = {}) => {
    const getIsRequestMoreMergedPendingSafe =
      typeof getIsRequestMoreMergedPending === "function"
        ? getIsRequestMoreMergedPending
        : () => false;
    const setIsRequestMoreMergedPendingSafe =
      typeof setIsRequestMoreMergedPending === "function"
        ? setIsRequestMoreMergedPending
        : () => {};
    const getLatestSelectedRepoSafe =
      typeof getLatestSelectedRepo === "function"
        ? getLatestSelectedRepo
        : () => "";
    const defaultRepoSafe = typeof defaultRepo === "string" ? defaultRepo : "";
    const getOptionalElementByIdSafe =
      typeof getOptionalElementById === "function"
        ? getOptionalElementById
        : () => null;
    const beginRequestActivitySafe =
      typeof beginRequestActivity === "function"
        ? beginRequestActivity
        : () => () => {};
    const postJsonSafe =
      typeof postJson === "function"
        ? postJson
        : async () => ({
            response: { ok: false },
            result: { ok: false, error: "postJson is not available" },
          });
    const setLatestStoredPayloadSafe =
      typeof setLatestStoredPayload === "function"
        ? setLatestStoredPayload
        : () => {};
    const setLatestSelectedRepoSafe =
      typeof setLatestSelectedRepo === "function"
        ? setLatestSelectedRepo
        : () => {};
    const renderPrDataSafe =
      typeof renderPrData === "function" ? renderPrData : () => {};
    const loadStoredDataSafe =
      typeof loadStoredData === "function" ? loadStoredData : async () => {};
    const setStatusMessageSafe =
      typeof setStatusMessage === "function" ? setStatusMessage : () => {};
    const notifyFailureSnackbarSafe =
      typeof notifyFailureSnackbar === "function"
        ? notifyFailureSnackbar
        : () => {};

    const handleRequestMoreMerged = async (repoOverride = "") => {
      if (getIsRequestMoreMergedPendingSafe()) {
        return;
      }

      const repo =
        String(repoOverride || getLatestSelectedRepoSafe() || "").trim() ||
        defaultRepoSafe;
      const button = getOptionalElementByIdSafe("merged-request-more-btn");
      const status = getOptionalElementByIdSafe("merged-request-more-status");

      setIsRequestMoreMergedPendingSafe(true);
      if (button) {
        button.disabled = true;
      }
      if (status) {
        status.textContent = "Requesting 30 more merged PRs...";
      }
      setStatusMessageSafe("Requesting more merged PRs...");

      const finishActivity = beginRequestActivitySafe("dataLoad");
      try {
        const { response, result } = await postJsonSafe(
          "/view-prs/merged/request-more",
          {
            repo,
            count: 30,
            scanLimit: 100,
          },
        );

        if (!response.ok || result?.ok === false) {
          throw new Error(result?.error || "Failed to request more merged PRs");
        }

        if (result?.prData) {
          setLatestStoredPayloadSafe(result.prData);
          setLatestSelectedRepoSafe(repo);
          renderPrDataSafe(result.prData, repo, { useLastRunScope: false });
        } else {
          await loadStoredDataSafe(repo, { useLastRunScope: false });
        }

        const refreshedCount = Array.isArray(result?.refreshedPrs)
          ? result.refreshedPrs.length
          : 0;
        const refreshedText =
          refreshedCount > 0
            ? `Loaded ${refreshedCount} merged PR${refreshedCount === 1 ? "" : "s"}.`
            : "No missing merged PRs found in the scanned range.";

        if (status) {
          status.textContent = refreshedText;
        }
        setStatusMessageSafe(refreshedText);
      } catch (error) {
        const message = String(error?.message || error || "Request failed");
        if (status) {
          status.textContent = message;
        }
        setStatusMessageSafe("Failed to request more merged PRs");
        notifyFailureSnackbarSafe(
          "Request more failed",
          error,
          "Unable to fetch more merged PRs",
        );
      } finally {
        setIsRequestMoreMergedPendingSafe(false);
        if (button) {
          button.disabled = false;
        }
        finishActivity();
      }
    };

    return {
      handleRequestMoreMerged,
    };
  };

  return {
    createPrMergedRequestMoreActionHelpers,
  };
});
