// Phase 7, sub-phase 7.6 (see REACT_MIGRATION_PLAN.md): extracted verbatim
// from index.page.js's former handleTriggerAutoRun body (pure extraction,
// zero behavior change - same discipline as every sibling action already
// extracted this way: pr-row-checkbox-actions.helpers.js,
// pr-ack-label-actions.helpers.js, pr-single-pr-update.helpers.js,
// pr-merged-request-more-action.helpers.js, pr-quick-check-actions.helpers.js).
// index.page.js's own handleTriggerAutoRun is now a thin wrapper calling
// runTriggerAutoRunWorkflow(), wired to the real React
// TriggerAutoRunButton.jsx via the same window.handleTriggerAutoRun bridge
// as before.
export const { createPrTriggerAutoRunActionHelpers } = (() => {
  const createPrTriggerAutoRunActionHelpers = ({
    postJson,
    showErrorNotification,
    notifyFailureSnackbar,
  } = {}) => {
    const postJsonSafe =
      typeof postJson === "function"
        ? postJson
        : () => Promise.reject(new Error("postJson unavailable"));
    const showErrorNotificationSafe =
      typeof showErrorNotification === "function" ? showErrorNotification : () => {};
    const notifyFailureSnackbarSafe =
      typeof notifyFailureSnackbar === "function" ? notifyFailureSnackbar : () => {};

    const runTriggerAutoRunWorkflow = async () => {
      try {
        const { response, result } = await postJsonSafe("/view-prs/run-auto", {});
        if (response.status === 409) {
          showErrorNotificationSafe(
            "Auto run already in progress",
            "An auto run is already running. It will complete shortly.",
            6000,
          );
        } else if (!response.ok || result.ok === false) {
          notifyFailureSnackbarSafe(
            "Failed to trigger auto run",
            result,
            result?.error || "Unexpected error triggering auto run",
          );
        }
      } catch (error) {
        notifyFailureSnackbarSafe(
          "Failed to trigger auto run",
          error,
          "Unable to reach the server",
        );
      }
    };

    return {
      runTriggerAutoRunWorkflow,
    };
  };

  return {
    createPrTriggerAutoRunActionHelpers,
  };
})();
