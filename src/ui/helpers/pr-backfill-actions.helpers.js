const createPrBackfillActionHelpers = ({
  fetch,
  postJson,
  beginRequestActivity,
  setStatusMessage,
  setOutputMessage,
  setBackfillButtonState,
  notifyFailureSnackbar,
  formatCommandOutput,
  stripAnsi,
  updateBackfillStatusFromPayload,
  setBackfillLogMessage,
  autoScrollBackfillLogToBottom,
  formatBackfillLogMessage,
  getSupportsBackfillLogPolling,
  setSupportsBackfillLogPolling,
  getIsBackfillRunning,
  setIsBackfillActionPending,
  backfillLogTailLines,
}) => {
  const loadBackfillLogTail = async () => {
    if (!getSupportsBackfillLogPolling()) {
      return {
        ok: false,
        summary: "Backfill log endpoint is unavailable",
        tail: "",
      };
    }

    const response = await fetch(
      `/view-prs/backfill/log?lines=${backfillLogTailLines}`,
    );

    if (response.status === 404) {
      setSupportsBackfillLogPolling(false);
      setBackfillLogMessage(
        "Backfill log endpoint is unavailable (404). Refresh/restart the server to enable log tailing.",
      );
      return {
        ok: false,
        summary: "Backfill log endpoint is unavailable",
        tail: "",
      };
    }

    const result = await response.json();

    if (!response.ok || result.ok === false) {
      throw new Error(result.error || "Failed to fetch backfill log");
    }

    setBackfillLogMessage(
      formatBackfillLogMessage({
        summary: result.summary,
        tail: result.tail,
      }),
    );
    autoScrollBackfillLogToBottom();

    return result;
  };

  const loadBackfillStatus = async ({
    announce = false,
    includeLog = false,
  } = {}) => {
    const response = await fetch("/view-prs/backfill");
    const result = await response.json();

    if (!response.ok || result.ok === false) {
      const error = new Error(
        result.error || "Failed to fetch backfill status",
      );
      error.result = result;
      throw error;
    }

    updateBackfillStatusFromPayload(result, { announce });
    if (includeLog) {
      await loadBackfillLogTail();
    }
    return result;
  };

  const handleBackfillAction = async (action) => {
    const actionLabel = action === "start" ? "Starting" : "Stopping";
    const finishActivity = beginRequestActivity("backfill");
    setIsBackfillActionPending(true);
    // Disable all 4 immediately, synchronously - the first status push
    // below (updateBackfillStatusFromPayload, after the POST resolves)
    // would otherwise leave a short window where a second click could
    // fire before the UI reflects the in-flight action.
    setBackfillButtonState({
      startDisabled: true,
      stopDisabled: true,
      refreshDisabled: true,
      refreshLogDisabled: true,
    });
    setStatusMessage(`${actionLabel} backfill...`);

    try {
      const { response, result } = await postJson(
        `/view-prs/backfill/${action}`,
        {},
      );
      updateBackfillStatusFromPayload(result);

      if (!response.ok || result.ok === false) {
        setStatusMessage(`Failed to ${action} backfill`);
        setOutputMessage(formatCommandOutput(result));
        notifyFailureSnackbar(
          `${actionLabel} backfill failed`,
          result,
          `Failed to ${action} backfill`,
        );
        return;
      }

      setStatusMessage(result.summary || `Backfill ${action}ed`);
      setOutputMessage(
        formatCommandOutput(result, { includeError: false }) ||
          (result.output ? stripAnsi(result.output) : `Backfill ${action}ed.`),
      );

      if (action === "start") {
        await loadBackfillStatus({ includeLog: true });
      }
    } catch (error) {
      setStatusMessage(`Failed to ${action} backfill`);
      setOutputMessage(String(error));
      notifyFailureSnackbar(
        `${actionLabel} backfill failed`,
        error,
        `Failed to ${action} backfill`,
      );
    } finally {
      setIsBackfillActionPending(false);
      try {
        await loadBackfillStatus({ includeLog: getIsBackfillRunning() });
      } catch (_error) {
        // Phase C (see REACT_MIGRATION_PLAN.md, "Full migration
        // roadmap"): the reload above normally pushes a fresh
        // buttonState (via renderBackfillStatus's own
        // window.updateReactBackfillButtonState call) that un-disables
        // whatever this action disabled - if that reload itself fails,
        // there's no fresh view model to push, so force every button
        // back to enabled directly instead of leaving the UI stuck.
        setBackfillButtonState({
          startDisabled: false,
          stopDisabled: false,
          refreshDisabled: false,
          refreshLogDisabled: false,
        });
      }
      finishActivity();
    }
  };

  return {
    loadBackfillStatus,
    loadBackfillLogTail,
    handleBackfillAction,
  };
};

export { createPrBackfillActionHelpers };
