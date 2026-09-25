// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsMergedRequestMoreActionHelpers fallback.
export const { createPrMergedRequestMoreActionHelpers } = (() => {
  const createPrMergedRequestMoreActionHelpers = ({
    getIsRequestMoreMergedPending,
    setIsRequestMoreMergedPending,
    getLatestSelectedRepo,
    defaultRepo,
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

    // onPendingChange/onStatusChange are call-time options, not constructor
    // deps - unlike the DOM element lookups they replace (which used to
    // read whatever #merged-request-more-btn/-status happened to exist at
    // click time), the caller is now a specific React component instance
    // (components/MergedRequestMoreAction.jsx) passing its own state
    // setters, so they have to be supplied per call, not once at module init.
    const handleRequestMoreMerged = async (
      repoOverride = "",
      { onPendingChange, onStatusChange } = {},
    ) => {
      if (getIsRequestMoreMergedPendingSafe()) {
        return;
      }

      const onPendingChangeSafe =
        typeof onPendingChange === "function" ? onPendingChange : () => {};
      const onStatusChangeSafe =
        typeof onStatusChange === "function" ? onStatusChange : () => {};

      const repo =
        String(repoOverride || getLatestSelectedRepoSafe() || "").trim() ||
        defaultRepoSafe;

      setIsRequestMoreMergedPendingSafe(true);
      onPendingChangeSafe(true);
      onStatusChangeSafe("Requesting 30 more merged PRs...");
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

        onStatusChangeSafe(refreshedText);
        setStatusMessageSafe(refreshedText);
      } catch (error) {
        const message = String(error?.message || error || "Request failed");
        onStatusChangeSafe(message);
        setStatusMessageSafe("Failed to request more merged PRs");
        notifyFailureSnackbarSafe(
          "Request more failed",
          error,
          "Unable to fetch more merged PRs",
        );
      } finally {
        setIsRequestMoreMergedPendingSafe(false);
        onPendingChangeSafe(false);
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
})();
