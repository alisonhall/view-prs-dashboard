const createViewPrsBackfillRouteHelpers = ({
  formatScriptFailureMessage,
  parseBackfillCommandOutput,
  viewPrsBackfillLogFile,
  viewPrsBackfillPidFile,
  viewPrsBackfillManagerRelativePath,
}) => {
  const createTimingContext = () => ({
    triggeredAt: new Date().toISOString(),
    startedAtMs: Date.now(),
  });

  const toDurationMs = (timingContext) => Date.now() - timingContext.startedAtMs;

  const buildReadActionLogFailureResult = (error) => ({
    responseStatusCode: 500,
    responsePayload: {
      ok: false,
      error: error.message || "Failed to read action log",
      entries: [],
    },
  });

  const buildReadActionLogSuccessResult = (entries) => ({
    responseStatusCode: 200,
    responsePayload: {
      ok: true,
      entries,
    },
  });

  const buildReadBackfillLogFailureResult = (error) => {
    const message = error.message || "Failed to read backfill log";
    return {
      responseStatusCode: 500,
      responsePayload: {
        ok: false,
        logFile: viewPrsBackfillLogFile,
        error: message,
        summary: message,
        tail: "",
      },
    };
  };

  const buildReadBackfillLogSuccessResult = (result) => ({
    responseStatusCode: 200,
    responsePayload: result,
  });

  const buildBackfillStatusFailureResult = ({ error, timingContext }) => {
    const message = error.message || "Failed to fetch backfill status";
    return {
      actionLogEntry: {
        action: "get/backfill",
        triggeredAt: timingContext.triggeredAt,
        durationMs: toDurationMs(timingContext),
        ok: false,
        error: message,
      },
      responsePayload: {
        ok: false,
        error: message,
      },
      responseStatusCode: 500,
    };
  };

  const buildBackfillStatusSuccessResult = ({ backfill, timingContext }) => ({
    actionLogEntry: {
      action: "get/backfill",
      triggeredAt: timingContext.triggeredAt,
      durationMs: toDurationMs(timingContext),
      ok: backfill.ok,
      detail: {
        running: backfill.running,
        pid: backfill.pid,
      },
    },
    responseStatusCode: backfill.ok ? 200 : 500,
    responsePayload: backfill,
  });

  const normalizeBackfillAction = (rawAction) =>
    String(rawAction || "")
      .trim()
      .toLowerCase();

  const isSupportedBackfillAction = (action) => ["start", "stop"].includes(action);

  const buildInvalidBackfillActionResult = (action) => ({
    responseStatusCode: 400,
    responsePayload: {
      ok: false,
      error: `Invalid backfill action: ${action}`,
    },
  });

  const buildBackfillActionFailureResult = ({ failure, action, timingContext }) => {
    const parsed = parseBackfillCommandOutput(
      failure?.stdout,
      failure?.stderr,
    );
    const message = formatScriptFailureMessage(failure, `Backfill ${action} failed`);

    return {
      actionLogEntry: {
        action: "post/backfill/:action",
        triggeredAt: timingContext.triggeredAt,
        durationMs: toDurationMs(timingContext),
        ok: false,
        error: message,
        detail: { action },
      },
      responsePayload: {
        ok: false,
        command:
          failure?.command ||
          `bash ${viewPrsBackfillManagerRelativePath} ${action}`,
        running: parsed.running,
        pid: parsed.pid,
        logFile: parsed.logFile || viewPrsBackfillLogFile,
        pidFile: viewPrsBackfillPidFile,
        summary:
          parsed.summary ||
          message ||
          `Backfill ${action} failed`,
        output: parsed.rawOutput,
        error: message,
      },
      responseStatusCode: 500,
    };
  };

  const buildBackfillActionSuccessResult = ({ result, action, timingContext }) => ({
    actionLogEntry: {
      action: "post/backfill/:action",
      triggeredAt: timingContext.triggeredAt,
      durationMs: toDurationMs(timingContext),
      ok: true,
      detail: {
        action,
        running: result.running,
        pid: result.pid,
      },
    },
    responseStatusCode: 200,
    responsePayload: result,
  });

  return {
    createTimingContext,
    buildReadActionLogFailureResult,
    buildReadActionLogSuccessResult,
    buildReadBackfillLogFailureResult,
    buildReadBackfillLogSuccessResult,
    buildBackfillStatusSuccessResult,
    buildBackfillStatusFailureResult,
    normalizeBackfillAction,
    isSupportedBackfillAction,
    buildInvalidBackfillActionResult,
    buildBackfillActionSuccessResult,
    buildBackfillActionFailureResult,
  };
};

module.exports = {
  createViewPrsBackfillRouteHelpers,
};