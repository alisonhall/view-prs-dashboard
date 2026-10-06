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
  clearPendingForRepo,
  appendActionLogEntry,
  readViewPrsData,
  enqueuePrDiffRefreshForData,
  formatScriptFailureMessage,
  viewPrsSchedulerState,
  resetViewPrsAutoRefreshFailureState,
  runViewPrsAutoRefresh,
  runViewPrsQuickCheck,
  buildAckRefreshBudgetSkipErrors,
  isRepoSlug,
  listMergedPrCandidates,
  listRepoLabels,
  applyLabelToPr,
  fetchGithubPrLabels,
  patchStoredPrLabels,
  // Activity drawer feature (see REACT_MIGRATION_PLAN.md): called once a
  // route below has actually written to the stored PR data file, so every
  // *other* connected tab can refresh immediately instead of waiting for
  // its own 30s poll - the requesting tab already learns its own result
  // synchronously via this route's own response. Safely no-ops if absent
  // (e.g. in tests that don't wire it).
  emitDataChanged,
}) => {
  const emitDataChangedSafe =
    typeof emitDataChanged === "function" ? emitDataChanged : () => {};
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
    buildQuickCheckAlreadyInProgressResult,
    buildQuickCheckMissingDependenciesResult,
    buildQuickCheckCircuitOpenResult,
    buildQuickCheckFatalFailureResult,
    buildQuickCheckSuccessResult,
    buildQuickCheckSuccessActionLogEntry,
    buildQuickCheckFailureActionLogEntry,
    buildQuickCheckNumbersRequest,
    buildQuickCheckAllRequest,
    buildAckRequest,
    createAckScriptRunner,
    buildAckRefreshList,
    buildAckSuccessActionLogEntry,
    buildAckFailureActionLogEntry,
    buildAckSuccessResult,
    buildAckMinimalSuccessResult,
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
    buildListRepoLabelsRequest,
    buildListRepoLabelsInvalidRepoResult,
    buildListRepoLabelsSuccessResult,
    buildListRepoLabelsFailureResult,
    buildApplyLabelRequest,
    buildApplyLabelBadRequestResult,
    buildApplyLabelMissingDependenciesResult,
    buildApplyLabelSuccessActionLogEntry,
    buildApplyLabelFailureActionLogEntry,
    buildApplyLabelSuccessResult,
    buildApplyLabelFailureResult,
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
      // Tags this run's active-PR-tracking entries with the repo it
      // targets (see app.js's buildActivePrKey) - PR numbers are only
      // unique within a repo, and other repos' PRs may be visible
      // alongside this run's in the UI.
      repo: detail.repo,
    })
      .then(({ stdout, stderr }) => {
        setLastManualRunNow();
        // A full-repo manual run (no single --pr target) covers everything
        // the quick-check may have queued, so it's resolved now too.
        if (detail.repo && !detail.prNumber) {
          clearPendingForRepo(detail.repo);
        }
        appendActionLogEntry(
          buildRunSuccessActionLogEntry({
            timingContext,
            detail,
          }),
        );
        const prData = readViewPrsData();
        enqueuePrDiffRefreshForData(prData);
        emitDataChangedSafe();
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

  // Manual trigger for the scheduler's own cheap "did anything change" pass
  // (see runViewPrsQuickCheck) - unlike /run-auto this is awaited directly
  // rather than fire-and-forget, since it's a single listing-only `gh` call
  // per repo (no comments/reviews/diffs), fast enough to return inline.
  // Branches entirely on runViewPrsQuickCheck's own returned result rather
  // than re-checking scheduler state independently beforehand, so the
  // route can't drift from what the function actually decided.
  //
  // Shared by /quick-check and /quick-check-all below - both branch on
  // runViewPrsQuickCheck's returned result the same way, only the request
  // that produced checkResult differs (single/default repo vs a whole
  // repoRequests sweep).
  const sendQuickCheckResult = ({ res, timingContext, checkResult }) => {
    if (checkResult.skipped) {
      const skipResult =
        checkResult.skipReason === "missing-dependencies"
          ? buildQuickCheckMissingDependenciesResult(checkResult.missing || [])
          : checkResult.skipReason === "circuit-open"
            ? buildQuickCheckCircuitOpenResult()
            : buildQuickCheckAlreadyInProgressResult();
      appendActionLogEntry(
        buildQuickCheckFailureActionLogEntry({
          timingContext,
          error: skipResult.responsePayload.error,
        }),
      );
      sendRouteResult({ res, result: skipResult });
      return;
    }

    if (checkResult.fatalError) {
      const failureResult = buildQuickCheckFatalFailureResult(checkResult.fatalError);
      appendActionLogEntry(
        buildQuickCheckFailureActionLogEntry({
          timingContext,
          error: checkResult.fatalError,
        }),
      );
      sendRouteResult({ res, result: failureResult });
      return;
    }

    const successResult = buildQuickCheckSuccessResult({
      lastQuickCheckAt: viewPrsSchedulerState.lastQuickCheckAt,
      reposChecked: checkResult.reposChecked,
      reposFailed: checkResult.reposFailed,
      newPendingOpenCount: checkResult.newPendingOpenCount,
      newPendingMergedClosedCount: checkResult.newPendingMergedClosedCount,
    });
    appendActionLogEntry(
      buildQuickCheckSuccessActionLogEntry({ timingContext, result: successResult }),
    );
    sendRouteResult({ res, result: successResult });
  };

  app.post(["/quick-check", "/view-prs/quick-check"], async (req, res) => {
    const timingContext = createTimingContext();

    // Populated only when the Run & Filter tab's PR-number field had numbers
    // entered - scopes this check to exactly those PRs in one repo, bypassing
    // check-open-pr-updates.sh's day-window entirely (see --quick-check-numbers).
    // undefined here preserves today's default: every configured repo, listed
    // and day-windowed as usual.
    const numbersRequest = buildQuickCheckNumbersRequest({
      body: req.body || {},
      defaultViewPrsRepo,
    });

    const checkResult = await runViewPrsQuickCheck(numbersRequest);
    sendQuickCheckResult({ res, timingContext, checkResult });
  });

  // "Quick check all existing PRs" - checks every PR number already loaded
  // in the app, grouped by its own repo (the loaded table isn't scoped to
  // one repo - see PrTableApp.jsx), one gh pr view call per PR number rather
  // than the default's single cheap listing call per repo. Reuses the same
  // runViewPrsQuickCheck/isQuickCheckInProgress lock as /quick-check (one
  // lock acquisition for the whole sweep) rather than firing one request per
  // repo from the client, which would just race against itself for that lock.
  app.post(["/quick-check-all", "/view-prs/quick-check-all"], async (req, res) => {
    const timingContext = createTimingContext();

    const repoRequests = buildQuickCheckAllRequest({ body: req.body || {} });

    if (repoRequests.length === 0) {
      sendQuickCheckResult({
        res,
        timingContext,
        checkResult: {
          skipped: false,
          reposChecked: [],
          reposFailed: [],
          newPendingOpenCount: 0,
          newPendingMergedClosedCount: 0,
        },
      });
      return;
    }

    const checkResult = await runViewPrsQuickCheck({ repoRequests });
    sendQuickCheckResult({ res, timingContext, checkResult });
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
    
    // Determine if this is a checkbox-only operation (flagged/inReview only)
    const isCheckboxOnly = !detail.ack && !detail.ackClear;
    
    runScript(args)
      .then(async ({ stdout, stderr }) => {
        const effectiveRepo = repo || defaultViewPrsRepo;
        
        // OPTIMIZATION: Skip PR refresh for checkbox-only operations
        // Checkbox operations (flagged/inReview) only update flag files,
        // not PR data, so we don't need to re-fetch PR details.
        // This saves ~100-200ms per operation.
        let refreshedPrs = [];
        let refreshErrors = [];
        
        if (!isCheckboxOnly) {
          // Only refresh PRs for ack/ackClear operations
          const refreshList = buildAckRefreshList(detail);
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
        }

        if (refreshedPrs.length > 0) {
          emitDataChangedSafe();
        }

        appendActionLogEntry(
          buildAckSuccessActionLogEntry({
            timingContext,
            detail,
            refreshedCount: refreshedPrs.length,
          }),
        );
        
        // Read PR data (needed for both minimal and full responses)
        const prData = readViewPrsData();
        
        // OPTIMIZATION: Only enqueue diff refresh for ack operations
        if (!isCheckboxOnly) {
          enqueuePrDiffRefreshForData(prData);
        }
        
        // OPTIMIZATION: Return minimal payload for checkbox-only operations
        // Minimal response (~1-5KB) vs full response (~100-500KB)
        const successResult = isCheckboxOnly
          ? buildAckMinimalSuccessResult({
              displayCommand,
              stdout,
              stderr,
              prData,
            })
          : buildAckSuccessResult({
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
        emitDataChangedSafe();
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

  app.get(["/labels", "/view-prs/labels"], async (req, res) => {
    const { repo } = buildListRepoLabelsRequest({
      query: req.query || {},
      defaultViewPrsRepo,
    });

    if (!isRepoSlug(repo)) {
      sendRouteResult({
        res,
        result: buildListRepoLabelsInvalidRepoResult(repo),
      });
      return;
    }

    try {
      const labels = await listRepoLabels({ repo });
      sendRouteResult({
        res,
        result: buildListRepoLabelsSuccessResult({ repo, labels }),
      });
    } catch (error) {
      sendRouteResult({ res, result: buildListRepoLabelsFailureResult(error) });
    }
  });

  app.post(["/labels/apply", "/view-prs/labels/apply"], async (req, res) => {
    const body = req.body || {};
    const { repo, label, prNumbers } = buildApplyLabelRequest({
      body,
      defaultViewPrsRepo,
    });
    const timingContext = createTimingContext();

    if (!isRepoSlug(repo)) {
      sendRouteResult({
        res,
        result: buildApplyLabelBadRequestResult(`Invalid repo: ${repo}`),
      });
      return;
    }
    if (!label) {
      sendRouteResult({
        res,
        result: buildApplyLabelBadRequestResult("Label is required"),
      });
      return;
    }
    if (prNumbers.length === 0) {
      sendRouteResult({
        res,
        result: buildApplyLabelBadRequestResult(
          'Provide at least one numeric PR number in "prNumbers"',
        ),
      });
      return;
    }

    const dependencyStatus = callGetDependencyStatus();
    if (!dependencyStatus.ok) {
      const missingDependenciesResult = buildApplyLabelMissingDependenciesResult(
        dependencyStatus.missing,
      );
      appendActionLogEntry(
        buildApplyLabelFailureActionLogEntry({
          timingContext,
          repo,
          label,
          error: missingDependenciesResult.responsePayload.error,
        }),
      );
      sendRouteResult({ res, result: missingDependenciesResult });
      return;
    }

    try {
      const appliedPrs = [];
      const applyErrors = [];

      for (const prNumber of prNumbers) {
        try {
          await applyLabelToPr({ repo, prNumber, label });
          appliedPrs.push(prNumber);
        } catch (error) {
          applyErrors.push({
            prNumber,
            error: error?.message || "Failed to apply label",
          });
        }
      }

      // Patch just the authoritative label set directly into stored data
      // instead of running a full check-open-pr-updates.sh --pr <n> refresh
      // (runAckRefreshes' approach for /ack): a full refresh also re-fetches
      // comments, reviews, file diffs, and review threads, which can take
      // minutes for a PR with a lot of history - especially merged PRs -
      // leaving the just-applied label invisible in the UI until whatever
      // refresh eventually completes (or the next scheduled auto-refresh).
      // fetchGithubPrLabels/patchStoredPrLabels are each a single small `gh`
      // call and a targeted file patch, so this stays fast regardless of a
      // PR's size or history.
      const refreshedPrs = [];
      const refreshErrors = [];

      for (const prNumber of appliedPrs) {
        try {
          const labels = await fetchGithubPrLabels({ repo, prNumber });
          const patched = await patchStoredPrLabels({ repo, prNumber, labels });
          if (patched) {
            refreshedPrs.push(prNumber);
          } else {
            refreshErrors.push({
              prNumber,
              error: "No matching stored PR entry to update",
            });
          }
        } catch (error) {
          refreshErrors.push({
            prNumber,
            error: error?.message || "Failed to refresh label state",
          });
        }
      }

      if (refreshedPrs.length > 0) {
        emitDataChangedSafe();
      }

      appendActionLogEntry(
        buildApplyLabelSuccessActionLogEntry({
          timingContext,
          repo,
          label,
          appliedPrs,
          applyErrors,
          refreshedPrs,
          refreshErrors,
        }),
      );

      const prData = readViewPrsData();
      if (appliedPrs.length > 0) {
        enqueuePrDiffRefreshForData(prData);
      }

      sendRouteResult({
        res,
        result: buildApplyLabelSuccessResult({
          repo,
          label,
          appliedPrs,
          applyErrors,
          refreshErrors,
          prData,
        }),
      });
    } catch (error) {
      const failureResult = buildApplyLabelFailureResult(error);
      appendActionLogEntry(
        buildApplyLabelFailureActionLogEntry({
          timingContext,
          repo,
          label,
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
