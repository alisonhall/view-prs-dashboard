const {
  createViewPrsRouteResponseHelpers,
} = require("../helpers/view-prs-route-response-helpers");
const {
  createViewPrsRouteHandlerHelpers,
} = require("../helpers/view-prs-route-handler-helpers");
const {
  createViewPrsBackfillRouteHelpers,
} = require("../helpers/view-prs-backfill-route-helpers");

const registerViewPrsBackfillRoutes = ({
  app,
  appendActionLogEntry,
  getViewPrsBackfillPublicState,
  getBackfillLogTail,
  parseBackfillCommandOutput,
  runViewPrsBackfillAction,
  formatScriptFailureMessage,
  viewPrsBackfillLogFile,
  viewPrsBackfillPidFile,
  viewPrsBackfillManagerRelativePath,
  readActionLog,
}) => {
  const { runSafely, runSafelyAsync, sendInternalError, sendRouteResult } =
    createViewPrsRouteResponseHelpers();
  const { createSyncHandler, createAsyncHandler } = createViewPrsRouteHandlerHelpers({
    runSafely,
    runSafelyAsync,
    sendInternalError,
  });
  const {
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
  } = createViewPrsBackfillRouteHelpers({
    formatScriptFailureMessage,
    parseBackfillCommandOutput,
    viewPrsBackfillLogFile,
    viewPrsBackfillPidFile,
    viewPrsBackfillManagerRelativePath,
  });

  app.get(
    ["/backfill", "/view-prs/backfill"],
    createAsyncHandler({
      handler: async (_req, res) => {
        const timingContext = createTimingContext();
        try {
          const backfill = await getViewPrsBackfillPublicState();
          const successResult = buildBackfillStatusSuccessResult({
            backfill,
            timingContext,
          });
          appendActionLogEntry(successResult.actionLogEntry);
          sendRouteResult({ res, result: successResult });
        } catch (error) {
          const failureResult = buildBackfillStatusFailureResult({
            error,
            timingContext,
          });
          appendActionLogEntry(failureResult.actionLogEntry);
          sendRouteResult({ res, result: failureResult });
        }
      },
      onError: ({ error, res }) => {
        const failureResult = buildBackfillStatusFailureResult({
          error,
          timingContext: createTimingContext(),
        });
        appendActionLogEntry(failureResult.actionLogEntry);
        sendRouteResult({ res, result: failureResult });
      },
    }),
  );

  app.get(
    ["/action-log", "/view-prs/action-log"],
    createSyncHandler({
      handler: (_req, res) => {
        const entries = readActionLog();
        const successResult = buildReadActionLogSuccessResult(entries);
        sendRouteResult({ res, result: successResult });
      },
      onError: ({ error, res }) => {
        const failureResult = buildReadActionLogFailureResult(error);
        sendRouteResult({ res, result: failureResult });
      },
    }),
  );

  app.get(
    ["/backfill/log", "/view-prs/backfill/log"],
    createSyncHandler({
      handler: (req, res) => {
        const result = getBackfillLogTail({ maxLines: req.query.lines });
        const successResult = buildReadBackfillLogSuccessResult(result);
        sendRouteResult({ res, result: successResult });
      },
      onError: ({ error, res }) => {
        const failureResult = buildReadBackfillLogFailureResult(error);
        sendRouteResult({ res, result: failureResult });
      },
    }),
  );

  app.post(
    ["/backfill/:action", "/view-prs/backfill/:action"],
    createAsyncHandler({
      handler: async (req, res) => {
        const action = normalizeBackfillAction(req.params.action);

        if (!isSupportedBackfillAction(action)) {
          const invalidActionResult = buildInvalidBackfillActionResult(action);
          sendRouteResult({ res, result: invalidActionResult });
          return;
        }

        const timingContext = createTimingContext();
        try {
          const result = await runViewPrsBackfillAction(action);
          const successResult = buildBackfillActionSuccessResult({
            result,
            action,
            timingContext,
          });
          appendActionLogEntry(successResult.actionLogEntry);
          sendRouteResult({ res, result: successResult });
        } catch (failure) {
          const failureResult = buildBackfillActionFailureResult({
            failure,
            action,
            timingContext,
          });
          appendActionLogEntry(failureResult.actionLogEntry);
          sendRouteResult({ res, result: failureResult });
        }
      },
      onError: ({ error: failure, req, res }) => {
        const action = normalizeBackfillAction(req.params.action);
        const failureResult = buildBackfillActionFailureResult({
          failure,
          action,
          timingContext: createTimingContext(),
        });
        appendActionLogEntry(failureResult.actionLogEntry);
        sendRouteResult({ res, result: failureResult });
      },
    }),
  );
};

module.exports = {
  registerViewPrsBackfillRoutes,
};
