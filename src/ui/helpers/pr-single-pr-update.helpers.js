(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsSinglePrUpdateHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrSinglePrUpdateHelpers = ({
    postJson,
    beginRequestActivity,
    setStatusMessage,
    setOutputMessage,
    getGithubAuthFailureHint,
    formatCommandOutputWithAuthHint,
    notifyFailureSnackbar,
    stripAnsi,
    setLatestStoredPayload,
    setLatestSelectedRepo,
    renderPrData,
    loadStoredData,
    defaultRepo,
  } = {}) => {
    const postJsonSafe = typeof postJson === "function" ? postJson : async () => ({
      response: { ok: false },
      result: { ok: false, error: "postJson is not available" },
    });
    const beginRequestActivitySafe =
      typeof beginRequestActivity === "function" ? beginRequestActivity : () => () => {};
    const setStatusMessageSafe =
      typeof setStatusMessage === "function" ? setStatusMessage : () => {};
    const setOutputMessageSafe =
      typeof setOutputMessage === "function" ? setOutputMessage : () => {};
    const getGithubAuthFailureHintSafe =
      typeof getGithubAuthFailureHint === "function"
        ? getGithubAuthFailureHint
        : () => "";
    const formatCommandOutputWithAuthHintSafe =
      typeof formatCommandOutputWithAuthHint === "function"
        ? formatCommandOutputWithAuthHint
        : () => "";
    const notifyFailureSnackbarSafe =
      typeof notifyFailureSnackbar === "function"
        ? notifyFailureSnackbar
        : () => {};
    const stripAnsiSafe = typeof stripAnsi === "function" ? stripAnsi : (value) => String(value || "");
    const setLatestStoredPayloadSafe =
      typeof setLatestStoredPayload === "function" ? setLatestStoredPayload : () => {};
    const setLatestSelectedRepoSafe =
      typeof setLatestSelectedRepo === "function" ? setLatestSelectedRepo : () => {};
    const renderPrDataSafe = typeof renderPrData === "function" ? renderPrData : () => {};
    const loadStoredDataSafe = typeof loadStoredData === "function" ? loadStoredData : async () => {};
    const defaultRepoSafe = typeof defaultRepo === "string" ? defaultRepo : "";

    const runSinglePrUpdate = async (entry, row) => {
      const prNumber = String(row?.number || entry?.prNumber || "");
      const repo = entry?.repo || defaultRepoSafe;
      setStatusMessageSafe(`Updating PR #${prNumber}...`);
      setOutputMessageSafe("");
      const finishActivity = beginRequestActivitySafe("singlePr");

      try {
        const { response, result } = await postJsonSafe("/view-prs/run", {
          repo,
          prNumber,
          openMode: "none",
          quiet: true,
        });

        if (!response.ok || result.ok === false) {
          setStatusMessageSafe(`Failed to update PR #${prNumber}`);
          const authHint = getGithubAuthFailureHintSafe(result);
          if (authHint) {
            setStatusMessageSafe(
              `Failed to update PR #${prNumber} (GitHub auth required)`,
            );
          }
          setOutputMessageSafe(
            formatCommandOutputWithAuthHintSafe(result, { includeStderr: false }),
          );
          notifyFailureSnackbarSafe(
            `Update failed for PR #${prNumber}`,
            result,
            `Failed to update PR #${prNumber}`,
          );
          return;
        }

        setStatusMessageSafe(`PR #${prNumber} updated`);
        setOutputMessageSafe(result.output ? stripAnsiSafe(result.output) : "");

        const latestData = result.prData || null;
        if (latestData) {
          setLatestStoredPayloadSafe(latestData);
          setLatestSelectedRepoSafe(repo);
          renderPrDataSafe(latestData, repo, { useLastRunScope: false });
        }
        await loadStoredDataSafe(repo, { useLastRunScope: false });
      } catch (error) {
        setStatusMessageSafe(`Failed to update PR #${prNumber}`);
        setOutputMessageSafe(String(error));
        notifyFailureSnackbarSafe(
          `Update failed for PR #${prNumber}`,
          error,
          `Failed to update PR #${prNumber}`,
        );
      } finally {
        finishActivity();
      }
    };

    return {
      runSinglePrUpdate,
    };
  };

  return {
    createPrSinglePrUpdateHelpers,
  };
});
