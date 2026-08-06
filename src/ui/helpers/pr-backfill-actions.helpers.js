(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrBackfillActionHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrBackfillActionHelpers = ({
    fetch,
    postJson,
    beginRequestActivity,
    setStatusMessage,
    setOutputMessage,
    setButtonDisabled,
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
      setButtonDisabled("backfill-start-btn", true);
      setButtonDisabled("backfill-stop-btn", true);
      setButtonDisabled("backfill-refresh-btn", true);
      setButtonDisabled("backfill-log-refresh-btn", true);
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
          setButtonDisabled("backfill-start-btn", false);
          setButtonDisabled("backfill-stop-btn", false);
          setButtonDisabled("backfill-refresh-btn", false);
          setButtonDisabled("backfill-log-refresh-btn", false);
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

  return {
    createPrBackfillActionHelpers,
  };
});
