(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsPrBackfillHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const getBackfillStateKey = (backfillRaw = {}) => {
    const backfill = backfillRaw || {};
    return JSON.stringify({
      running: Boolean(backfill.running),
      pid: backfill.pid || "",
      summary: backfill.summary || "",
      error: backfill.error || "",
    });
  };

  const shouldAutoScrollBackfillLog = ({
    autoScrollEnabled = false,
    isBackfillRunning = false,
  } = {}) => autoScrollEnabled && isBackfillRunning;

  const getBackfillScrollTop = ({
    scrollHeight,
    currentScrollTop,
    shouldAutoScroll = false,
  }) => {
    if (!shouldAutoScroll) {
      return currentScrollTop;
    }
    const height = Number(scrollHeight);
    return Number.isFinite(height) ? height : currentScrollTop;
  };

  const getBackfillStatusViewModel = ({
    backfillRaw = {},
    isBackfillActionPending = false,
  } = {}) => {
    const backfill = backfillRaw || {};
    const badges = [
      {
        text: backfill.running ? "Backfill: running" : "Backfill: stopped",
        className: backfill.running
          ? "scheduler-badge-running"
          : "scheduler-badge-stopped",
      },
    ];

    if (backfill.ok === false) {
      badges.push({
        text: "Status error",
        className: "scheduler-badge-error",
      });
    }

    if (backfill.pid) {
      badges.push({
        text: `PID ${backfill.pid}`,
        className: "",
      });
    }

    const lines = [
      `Summary: ${backfill.summary || "-"}`,
      `PID: ${backfill.pid || "-"}`,
      `Log file: ${backfill.logFile || "-"}`,
      `PID file: ${backfill.pidFile || "-"}`,
    ];

    if (backfill.error) {
      lines.push(`Error: ${backfill.error}`);
    }

    return {
      badges,
      detailsText: lines.join("\n"),
      isBackfillRunning: backfill.running === true,
      buttonState: {
        startDisabled: isBackfillActionPending || backfill.running === true,
        stopDisabled: isBackfillActionPending || backfill.running !== true,
        refreshDisabled: isBackfillActionPending,
        refreshLogDisabled: isBackfillActionPending,
      },
      stateKey: getBackfillStateKey(backfill),
    };
  };

  const formatBackfillLogMessage = ({ summary = "", tail = "" } = {}) => {
    const summaryLine = String(summary || "").trim();
    const logBody = String(tail || "") || "(no log lines yet)";
    return [summaryLine || "Backfill log", "", logBody]
      .filter(Boolean)
      .join("\n");
  };

  const createPrBackfillHelpers = () => ({
    getBackfillStateKey,
    shouldAutoScrollBackfillLog,
    getBackfillScrollTop,
    getBackfillStatusViewModel,
    formatBackfillLogMessage,
  });

  return {
    createPrBackfillHelpers,
  };
});
