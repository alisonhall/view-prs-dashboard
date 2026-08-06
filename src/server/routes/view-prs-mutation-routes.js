const {
  createViewPrsMutationRouteHelpers,
} = require("../helpers/view-prs-mutation-route-helpers");
const {
  createViewPrsRouteResponseHelpers,
} = require("../helpers/view-prs-route-response-helpers");

const registerViewPrsMutationRoutes = ({
  app,
  viewPrsRunScriptRelativePath,
  callGetDependencyStatus,
  callRunViewPrsScript,
  viewPrsManualScriptTimeoutMs,
  viewPrsAckScriptTimeoutMs,
  viewPrsAckRefreshScriptTimeoutMs,
  viewPrsAckTotalRefreshTimeoutMs,
  defaultViewPrsRepo,
  setLastManualRunNow,
  appendActionLogEntry,
  readViewPrsData,
  enqueuePrDiffRefreshForData,
  formatScriptFailureMessage,
  viewPrsSchedulerState,
  resetViewPrsAutoRefreshFailureState,
  runViewPrsAutoRefresh,
  buildAckRefreshBudgetSkipErrors,
  isRepoSlug,
  listMergedPrCandidates,
}) => {
  const { sendRouteResult } = createViewPrsRouteResponseHelpers();
  const {
    createTimingContext,
    buildBadRequestResult,
    buildRunRequest,
    buildRunMissingDependenciesResult,
    buildRunSuccessResult,
    buildRunFailureResult,
    buildRunSuccessActionLogEntry,
    buildRunFailureActionLogEntry,
    buildRunAutoAlreadyInProgressResult,
    buildRunAutoMissingDependenciesResult,
    buildRunAutoSuccessResult,
    buildRunAutoFailureActionLogEntry,
    buildRunAutoSuccessActionLogEntry,
    buildAckRequest,
    createAckScriptRunner,
    buildAckRefreshList,
    buildAckSuccessActionLogEntry,
    buildAckFailureActionLogEntry,
    buildAckSuccessResult,
    buildAckFailureResult,
    runAckRefreshes,
    buildRequestMoreRequest,
    buildRequestMoreInvalidRepoResult,
    buildRequestMoreMissingDependenciesResult,
    buildStoredPrNumbersForRepo,
    buildMissingMergedCandidates,
    runRequestMoreRefreshes,
    buildRequestMoreSuccessActionLogEntry,
    buildRequestMoreFailureActionLogEntry,
    buildRequestMoreSuccessResult,
    buildRequestMoreFailureResult,
  } = createViewPrsMutationRouteHelpers({
    formatScriptFailureMessage,
  });

  app.post(["/run", "/view-prs/run"], function (req, res, _next) {
    const body = req.body || {};
    let runRequest;

    try {
      runRequest = buildRunRequest({ body, viewPrsRunScriptRelativePath });
    } catch (error) {
      const badRequestResult = buildBadRequestResult(error.message);
      sendRouteResult({ res, result: badRequestResult });
      return;
    }

    const { args, detail, displayCommand } = runRequest;
    const dependencyStatus = callGetDependencyStatus();
    const missing = dependencyStatus.missing;

    if (missing.length > 0) {
      const missingDependenciesResult = buildRunMissingDependenciesResult({
        displayCommand,
        missing,
      });
      sendRouteResult({ res, result: missingDependenciesResult });
      return;
    }

    const timingContext = createTimingContext();
    callRunViewPrsScript(args, 10 * 1024 * 1024, {
      timeoutMs: viewPrsManualScriptTimeoutMs,
    })
      .then(({ stdout, stderr }) => {
        setLastManualRunNow();
        appendActionLogEntry(
          buildRunSuccessActionLogEntry({
            timingContext,
            detail,
          }),
        );
        const prData = readViewPrsData();
        enqueuePrDiffRefreshForData(prData);
        const successResult = buildRunSuccessResult({
          displayCommand,
          stdout,
          stderr,
          prData,
        });
        sendRouteResult({ res, result: successResult });
      })
      .catch((failure) => {
        const failureResult = buildRunFailureResult({
          failure,
          displayCommand,
        });
        appendActionLogEntry(
          buildRunFailureActionLogEntry({
            timingContext,
            detail,
            error: failureResult.responsePayload.error,
          }),
        );
        sendRouteResult({ res, result: failureResult });
      });
  });

  app.post(["/run-auto", "/view-prs/run-auto"], (_req, res) => {
    const timingContext = createTimingContext();

    if (viewPrsSchedulerState.isAutoRunInProgress) {
      const conflictResult = buildRunAutoAlreadyInProgressResult();
      appendActionLogEntry(
        buildRunAutoFailureActionLogEntry({
          timingContext,
          error: conflictResult.responsePayload.error,
        }),
      );
      sendRouteResult({ res, result: conflictResult });
      return;
    }

    const dependencyStatus = callGetDependencyStatus();
    if (!dependencyStatus.ok) {
      const missingDependenciesResult = buildRunAutoMissingDependenciesResult(
        dependencyStatus.missing,
      );
      appendActionLogEntry(
        buildRunAutoFailureActionLogEntry({
          timingContext,
          error: missingDependenciesResult.responsePayload.error,
        }),
      );
      sendRouteResult({ res, result: missingDependenciesResult });
      return;
    }

    resetViewPrsAutoRefreshFailureState();
    void runViewPrsAutoRefresh({ skipCooldownChecks: true });

    appendActionLogEntry(buildRunAutoSuccessActionLogEntry({ timingContext }));

    const successResult = buildRunAutoSuccessResult();
    sendRouteResult({ res, result: successResult });
  });

  app.post(["/ack", "/view-prs/ack"], (req, res) => {
    const body = req.body || {};
    let ackRequest;

    const runScript = createAckScriptRunner({
      callRunViewPrsScript,
      viewPrsAckScriptTimeoutMs,
    });

    try {
      ackRequest = buildAckRequest({ body, viewPrsRunScriptRelativePath });
    } catch (error) {
      const badRequestResult = buildBadRequestResult(error.message);
      sendRouteResult({ res, result: badRequestResult });
      return;
    }

    const {
      args,
      detail: { repo },
      detail,
      displayCommand,
    } = ackRequest;
    const timingContext = createTimingContext();
    runScript(args)
      .then(async ({ stdout, stderr }) => {
        const effectiveRepo = repo || defaultViewPrsRepo;
        const refreshList = buildAckRefreshList(detail);
        let refreshedPrs = [];
        let refreshErrors = [];
        const deps = callGetDependencyStatus();

        if (deps.ok) {
          const refreshResult = await runAckRefreshes({
            refreshList,
            effectiveRepo,
            viewPrsRunScriptRelativePath,
            runScript,
            viewPrsAckRefreshScriptTimeoutMs,
            viewPrsAckTotalRefreshTimeoutMs,
            buildAckRefreshBudgetSkipErrors,
          });
          refreshedPrs = refreshResult.refreshedPrs;
          refreshErrors = refreshResult.refreshErrors;
        }

        appendActionLogEntry(
          buildAckSuccessActionLogEntry({
            timingContext,
            detail,
            refreshedCount: refreshedPrs.length,
          }),
        );
        const prData = readViewPrsData();
        enqueuePrDiffRefreshForData(prData);
        const successResult = buildAckSuccessResult({
          displayCommand,
          stdout,
          stderr,
          refreshedPrs,
          refreshErrors,
          prData,
        });
        sendRouteResult({ res, result: successResult });
      })
      .catch((failure) => {
        const failureResult = buildAckFailureResult({
          failure,
          displayCommand,
        });
        appendActionLogEntry(
          buildAckFailureActionLogEntry({
            timingContext,
            detail,
            error: failureResult.responsePayload.error,
          }),
        );
        sendRouteResult({ res, result: failureResult });
      });
  });

  app.post(["/merged/request-more", "/view-prs/merged/request-more"], async (req, res) => {
    const body = req.body || {};
    const requestMoreRequest = buildRequestMoreRequest({
      body,
      defaultViewPrsRepo,
    });
    const { repo, requestCount, scanLimit } = requestMoreRequest;
    const timingContext = createTimingContext();

    if (!isRepoSlug(repo)) {
      const invalidRepoResult = buildRequestMoreInvalidRepoResult(repo);
      sendRouteResult({ res, result: invalidRepoResult });
      return;
    }

    const dependencyStatus = callGetDependencyStatus();
    if (!dependencyStatus.ok) {
      const missingDependenciesResult = buildRequestMoreMissingDependenciesResult(
        dependencyStatus.missing,
      );
      sendRouteResult({ res, result: missingDependenciesResult });
      return;
    }

    try {
      const currentData = readViewPrsData();
      const storedForRepo = buildStoredPrNumbersForRepo({
        currentData,
        repo,
      });

      const mergedCandidates = await listMergedPrCandidates({
        repo,
        limit: scanLimit,
      });
      const missingCandidates = buildMissingMergedCandidates({
        mergedCandidates,
        storedForRepo,
        requestCount,
      });

      const refreshResult = await runRequestMoreRefreshes({
        missingCandidates,
        viewPrsRunScriptRelativePath,
        repo,
        callRunViewPrsScript,
        viewPrsAckRefreshScriptTimeoutMs,
      });
      const { refreshedPrs, refreshErrors } = refreshResult;

      if (refreshedPrs.length > 0) {
        setLastManualRunNow();
      }

      appendActionLogEntry(
        buildRequestMoreSuccessActionLogEntry({
          timingContext,
          repo,
          requestCount,
          scannedCount: mergedCandidates.length,
          refreshedCount: refreshedPrs.length,
        }),
      );
      const prData = readViewPrsData();
      enqueuePrDiffRefreshForData(prData);
      const successResult = buildRequestMoreSuccessResult({
        repo,
        requestCount,
        scanLimit,
        mergedCandidates,
        missingCandidates,
        refreshedPrs,
        refreshErrors,
        prData,
      });
      sendRouteResult({ res, result: successResult });
    } catch (error) {
      const failureResult = buildRequestMoreFailureResult(error);
      appendActionLogEntry(
        buildRequestMoreFailureActionLogEntry({
          timingContext,
          repo,
          error: failureResult.responsePayload.error,
        }),
      );
      sendRouteResult({ res, result: failureResult });
    }
  });
};

module.exports = {
  registerViewPrsMutationRoutes,
};
