const createViewPrsMutationRouteHelpers = ({ formatScriptFailureMessage }) => {
  const toTrimmedString = (value) => String(value || "").trim();

  const createTimingContext = () => ({
    triggeredAt: new Date().toISOString(),
    startedAtMs: Date.now(),
  });

  const buildMissingDependenciesMessage = (missing) =>
    `Missing required command(s): ${missing.join(", ")}`;

  const buildBadRequestResult = (errorMessage) => ({
    responseStatusCode: 400,
    responsePayload: {
      ok: false,
      error: errorMessage,
    },
  });

  const buildDisplayCommand = (args) => `bash ${args.join(" ")}`;

  const buildRunRequestDetail = (body = {}) => ({
    repo: toTrimmedString(body.repo) || null,
    prNumber: toTrimmedString(body.prNumber) || null,
  });

  const buildRunRequest = ({ body = {}, viewPrsRunScriptRelativePath }) => {
    const args = [viewPrsRunScriptRelativePath];

    const appendNumericFlag = (flagName, rawValue) => {
      const value = toTrimmedString(rawValue);
      if (!value) {
        return;
      }

      if (!/^\d+$/.test(value) || Number(value) < 1) {
        throw new Error(`Invalid ${flagName} value: ${value}`);
      }

      args.push(flagName, value);
    };

    const detail = buildRunRequestDetail(body);

    if (detail.repo) {
      if (!/^[^/\s]+\/[^/\s]+$/.test(detail.repo)) {
        throw new Error(`Invalid --repo value: ${detail.repo}`);
      }
      args.push("--repo", detail.repo);
    }

    if (detail.prNumber) {
      if (!/^\d+$/.test(detail.prNumber) || Number(detail.prNumber) < 1) {
        throw new Error(`Invalid --pr value: ${detail.prNumber}`);
      }
      args.push("--pr", detail.prNumber);
    }

    appendNumericFlag("--limit", body.limit);
    appendNumericFlag("--merged-limit", body.mergedLimit);
    appendNumericFlag("--jobs", body.jobs);

    const openMode = toTrimmedString(body.openMode || "none");
    if (!["all", "changed", "none"].includes(openMode)) {
      throw new Error(`Invalid --open mode: ${openMode}`);
    }
    args.push("--open", openMode);

    const ack = toTrimmedString(body.ack);
    if (ack) {
      args.push("--ack", ack);
    }

    const ackClear = toTrimmedString(body.ackClear);
    if (ackClear) {
      args.push("--ack-clear", ackClear);
    }

    if (body.ackChanged === true) {
      args.push("--ack-changed");
    }

    if (body.showReason === false) {
      args.push("--hide-reason");
    } else {
      args.push("--show-reason");
    }

    if (body.quiet === true) {
      args.push("--quiet");
    }

    return {
      args,
      detail,
      displayCommand: buildDisplayCommand(args),
    };
  };

  const buildRunMissingDependenciesResult = ({ displayCommand, missing }) => ({
    responseStatusCode: 500,
    responsePayload: {
      ok: false,
      command: displayCommand,
      error: buildMissingDependenciesMessage(missing),
      output: "",
      stderr: "Install missing CLI dependencies and retry.",
    },
  });

  const buildRunSuccessResult = ({ displayCommand, stdout, stderr, prData }) => ({
    responseStatusCode: 200,
    responsePayload: {
      ok: true,
      command: displayCommand,
      output: stdout,
      stderr,
      prData,
    },
  });

  const buildRunFailureResult = ({ failure, displayCommand }) => ({
    responseStatusCode: 500,
    responsePayload: {
      ok: false,
      command: displayCommand,
      error: formatScriptFailureMessage(failure, "Manual run failed"),
      output: failure?.stdout || "",
      stderr: failure?.stderr || "",
    },
  });

  const buildRunSuccessActionLogEntry = ({ timingContext, detail }) => ({
    action: "post/run",
    triggeredAt: timingContext.triggeredAt,
    durationMs: Date.now() - timingContext.startedAtMs,
    ok: true,
    detail,
  });

  const buildRunFailureActionLogEntry = ({ timingContext, detail, error }) => ({
    action: "post/run",
    triggeredAt: timingContext.triggeredAt,
    durationMs: Date.now() - timingContext.startedAtMs,
    ok: false,
    error,
    detail,
  });

  const buildRunAutoAlreadyInProgressResult = () => ({
    responseStatusCode: 409,
    responsePayload: {
      ok: false,
      error: "Auto run already in progress",
    },
  });

  const buildRunAutoMissingDependenciesResult = (missing) => ({
    responseStatusCode: 500,
    responsePayload: {
      ok: false,
      error: buildMissingDependenciesMessage(missing),
    },
  });

  const buildRunAutoSuccessResult = () => ({
    responseStatusCode: 202,
    responsePayload: { ok: true },
  });

  const buildRunAutoFailureActionLogEntry = ({ timingContext, error }) => ({
    action: "post/run-auto",
    triggeredAt: timingContext.triggeredAt,
    durationMs: Date.now() - timingContext.startedAtMs,
    ok: false,
    error,
  });

  const buildRunAutoSuccessActionLogEntry = ({ timingContext }) => ({
    action: "post/run-auto",
    triggeredAt: timingContext.triggeredAt,
    durationMs: Date.now() - timingContext.startedAtMs,
    ok: true,
    detail: {
      mode: "manual-trigger",
    },
  });

  // Unlike /run-auto (fire-and-forget, 202 - a full refresh can take
  // minutes), the quick check is the cheap listing-only pass by design, so
  // this route awaits runViewPrsQuickCheck() directly and reports its
  // actual per-run result object (see that function's own comment) instead
  // of re-deriving skip/success state independently, so the two can't drift.
  const buildQuickCheckAlreadyInProgressResult = () => ({
    responseStatusCode: 409,
    responsePayload: {
      ok: false,
      error: "Quick check or auto refresh already in progress",
    },
  });

  const buildQuickCheckMissingDependenciesResult = (missing) => ({
    responseStatusCode: 500,
    responsePayload: {
      ok: false,
      error: buildMissingDependenciesMessage(missing),
    },
  });

  const buildQuickCheckCircuitOpenResult = () => ({
    responseStatusCode: 503,
    responsePayload: {
      ok: false,
      error:
        "Auto refresh circuit breaker is open after repeated failures - try again later.",
    },
  });

  const buildQuickCheckFatalFailureResult = (errorMessage) => ({
    responseStatusCode: 500,
    responsePayload: {
      ok: false,
      error: errorMessage || "Quick check failed",
    },
  });

  // ok is false only when every checked repo failed (or none were checked
  // but some were attempted) - a partial failure (some repos succeeded,
  // others didn't) still reports ok:true so a working subset isn't treated
  // as a total failure, but reposFailed/error are always populated so the
  // caller can't mistake a partial failure for a clean, all-quiet run.
  const buildQuickCheckSuccessResult = ({
    lastQuickCheckAt,
    reposChecked = [],
    reposFailed = [],
    newPendingOpenCount = 0,
    newPendingMergedClosedCount = 0,
  }) => {
    const ok = reposFailed.length === 0 || reposChecked.length > 0;
    return {
      responseStatusCode: 200,
      responsePayload: {
        ok,
        ...(reposFailed.length > 0
          ? {
              error: `Quick check failed for ${reposFailed.length} of ${
                reposChecked.length + reposFailed.length
              } repo(s): ${reposFailed.map((failure) => failure.repo).join(", ")}`,
            }
          : {}),
        lastQuickCheckAt,
        reposChecked,
        reposFailed,
        newPendingOpenCount,
        newPendingMergedClosedCount,
      },
    };
  };

  const buildQuickCheckSuccessActionLogEntry = ({ timingContext, result }) => ({
    action: "post/quick-check",
    triggeredAt: timingContext.triggeredAt,
    durationMs: Date.now() - timingContext.startedAtMs,
    ok: result.responsePayload.ok,
    detail: {
      mode: "manual-trigger",
      reposChecked: result.responsePayload.reposChecked,
      reposFailed: result.responsePayload.reposFailed,
      newPendingOpenCount: result.responsePayload.newPendingOpenCount,
      newPendingMergedClosedCount: result.responsePayload.newPendingMergedClosedCount,
    },
    ...(result.responsePayload.error ? { error: result.responsePayload.error } : {}),
  });

  const buildQuickCheckFailureActionLogEntry = ({ timingContext, error }) => ({
    action: "post/quick-check",
    triggeredAt: timingContext.triggeredAt,
    durationMs: Date.now() - timingContext.startedAtMs,
    ok: false,
    error,
  });


  const parseNumberCsv = (raw) =>
    String(raw || "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value));

  const buildAckRequest = ({ body = {}, viewPrsRunScriptRelativePath }) => {
    const args = [viewPrsRunScriptRelativePath, "--ack-only", "--quiet"];
    const detail = {
      repo: toTrimmedString(body.repo),
      ack: toTrimmedString(body.ack),
      ackClear: toTrimmedString(body.ackClear),
      inReview: toTrimmedString(body.inReview),
      inReviewClear: toTrimmedString(body.inReviewClear),
      flagged: toTrimmedString(body.flagged),
      flaggedClear: toTrimmedString(body.flaggedClear),
    };

    if (detail.repo) {
      if (!/^[^/\s]+\/[^/\s]+$/.test(detail.repo)) {
        throw new Error(`Invalid --repo value: ${detail.repo}`);
      }
      args.push("--repo", detail.repo);
    }

    const operationFlags = [
      ["--ack", detail.ack],
      ["--ack-clear", detail.ackClear],
      ["--in-review", detail.inReview],
      ["--in-review-clear", detail.inReviewClear],
      ["--flagged", detail.flagged],
      ["--flagged-clear", detail.flaggedClear],
    ];

    operationFlags.forEach(([flag, value]) => {
      if (value) {
        args.push(flag, value);
      }
    });

    if (
      !detail.ack &&
      !detail.ackClear &&
      !detail.inReview &&
      !detail.inReviewClear &&
      !detail.flagged &&
      !detail.flaggedClear
    ) {
      throw new Error(
        "Provide at least one operation: ack, ackClear, inReview, inReviewClear, flagged, or flaggedClear",
      );
    }

    return {
      args,
      detail,
      displayCommand: buildDisplayCommand(args),
    };
  };

  const createAckScriptRunner = ({
    callRunViewPrsScript,
    viewPrsAckScriptTimeoutMs,
  }) =>
    (scriptArgs, timeoutMs = viewPrsAckScriptTimeoutMs) =>
      callRunViewPrsScript(scriptArgs, 4 * 1024 * 1024, { timeoutMs });

  const buildAckRefreshList = (detail) => [
    ...new Set([
      ...parseNumberCsv(detail.ack),
      ...parseNumberCsv(detail.ackClear),
      ...parseNumberCsv(detail.inReview),
      ...parseNumberCsv(detail.inReviewClear),
      ...parseNumberCsv(detail.flagged),
      ...parseNumberCsv(detail.flaggedClear),
    ]),
  ];

  const buildAckSuccessActionLogEntry = ({
    timingContext,
    detail,
    refreshedCount,
  }) => ({
    action: "post/ack",
    triggeredAt: timingContext.triggeredAt,
    durationMs: Date.now() - timingContext.startedAtMs,
    ok: true,
    detail: {
      ...detail,
      refreshedCount,
    },
  });

  const buildAckFailureActionLogEntry = ({ timingContext, detail, error }) => ({
    action: "post/ack",
    triggeredAt: timingContext.triggeredAt,
    durationMs: Date.now() - timingContext.startedAtMs,
    ok: false,
    error,
    detail,
  });

  const buildAckSuccessResult = ({
    displayCommand,
    stdout,
    stderr,
    refreshedPrs,
    refreshErrors,
    prData,
  }) => ({
    responseStatusCode: 200,
    responsePayload: {
      ok: true,
      command: displayCommand,
      output: stdout,
      stderr,
      refreshedPrs,
      refreshErrors,
      prData,
    },
  });

  /**
   * Build minimal success result for checkbox-only operations (flagged/inReview).
   * Returns only the changed flag data instead of the entire PR dataset.
   * This reduces response payload from ~100-500KB to ~1-5KB.
   *
   * @param {Object} params - Parameters
   * @param {string} params.displayCommand - Command that was executed
   * @param {string} params.stdout - Script stdout
   * @param {string} params.stderr - Script stderr
   * @param {Object} params.prData - Full PR data (only flaggedByRepo/inReviewByRepo used)
   * @returns {Object} Minimal response result
   */
  const buildAckMinimalSuccessResult = ({
    displayCommand,
    stdout,
    stderr,
    prData,
  }) => ({
    responseStatusCode: 200,
    responsePayload: {
      ok: true,
      command: displayCommand,
      output: stdout,
      stderr,
      // Only return the flag data, not the entire PR dataset
      flaggedByRepo: prData?.flaggedByRepo || {},
      inReviewByRepo: prData?.inReviewByRepo || {},
    },
  });

  const buildAckFailureResult = ({ failure, displayCommand }) => ({
    responseStatusCode: 500,
    responsePayload: {
      ok: false,
      command: displayCommand,
      error: formatScriptFailureMessage(failure, "Ack operation failed"),
      output: failure?.stdout || "",
      stderr: failure?.stderr || "",
    },
  });

  const runAckRefreshes = async ({
    refreshList,
    effectiveRepo,
    viewPrsRunScriptRelativePath,
    runScript,
    viewPrsAckRefreshScriptTimeoutMs,
    viewPrsAckTotalRefreshTimeoutMs,
    buildAckRefreshBudgetSkipErrors,
  }) => {
    const refreshDeadlineMs = Date.now() + viewPrsAckTotalRefreshTimeoutMs;
    const refreshedPrs = [];
    const refreshErrors = [];

    for (let index = 0; index < refreshList.length; index += 1) {
      const prNumber = refreshList[index];
      if (Date.now() >= refreshDeadlineMs) {
        refreshErrors.push(
          ...buildAckRefreshBudgetSkipErrors({
            refreshList,
            startIndex: index,
            totalRefreshBudgetMs: viewPrsAckTotalRefreshTimeoutMs,
          }),
        );
        break;
      }

      const refreshArgs = [
        viewPrsRunScriptRelativePath,
        "--quiet",
        "--open",
        "none",
        "--repo",
        effectiveRepo,
        "--pr",
        prNumber,
      ];

      try {
        await runScript(refreshArgs, viewPrsAckRefreshScriptTimeoutMs);
        refreshedPrs.push(prNumber);
      } catch (refreshFailure) {
        refreshErrors.push({
          prNumber,
          error: formatScriptFailureMessage(refreshFailure, "Refresh failed"),
        });
      }
    }

    return {
      refreshedPrs,
      refreshErrors,
    };
  };

  const buildRequestMoreRequest = ({ body = {}, defaultViewPrsRepo }) => {
    const repo = toTrimmedString(body.repo) || defaultViewPrsRepo;
    const requestCountRaw = Number.parseInt(String(body.count || "30"), 10);
    const scanLimitRaw = Number.parseInt(String(body.scanLimit || "100"), 10);
    const requestCount = Math.max(1, Math.min(50, requestCountRaw || 30));
    const scanLimit = Math.max(requestCount, Math.min(200, scanLimitRaw || 100));

    return {
      repo,
      requestCount,
      scanLimit,
    };
  };

  const buildRequestMoreInvalidRepoResult = (repo) => ({
    responseStatusCode: 400,
    responsePayload: {
      ok: false,
      error: `Invalid repo: ${repo}`,
    },
  });

  const buildRequestMoreMissingDependenciesResult = (missing) => ({
    responseStatusCode: 500,
    responsePayload: {
      ok: false,
      error: buildMissingDependenciesMessage(missing),
    },
  });

  const buildStoredPrNumbersForRepo = ({ currentData, repo }) =>
    new Set(
      Object.entries(currentData?.byPrNumber || {})
        .filter(([, entry]) => entry?.repo === repo)
        .map(([prNumber]) => String(prNumber).trim())
        .filter((prNumber) => /^\d+$/.test(prNumber)),
    );

  const buildMissingMergedCandidates = ({ mergedCandidates, storedForRepo, requestCount }) =>
    mergedCandidates
      .filter((item) => !storedForRepo.has(item.number))
      .slice(0, requestCount);

  const buildRequestMoreRefreshArgs = ({
    viewPrsRunScriptRelativePath,
    repo,
    prNumber,
  }) => [
    viewPrsRunScriptRelativePath,
    "--quiet",
    "--open",
    "none",
    "--repo",
    repo,
    "--pr",
    prNumber,
    "--show-reason",
  ];

  const runRequestMoreRefreshes = async ({
    missingCandidates,
    viewPrsRunScriptRelativePath,
    repo,
    callRunViewPrsScript,
    viewPrsAckRefreshScriptTimeoutMs,
  }) => {
    const refreshedPrs = [];
    const refreshErrors = [];

    for (const candidate of missingCandidates) {
      const refreshArgs = buildRequestMoreRefreshArgs({
        viewPrsRunScriptRelativePath,
        repo,
        prNumber: candidate.number,
      });

      try {
        await callRunViewPrsScript(refreshArgs, 4 * 1024 * 1024, {
          timeoutMs: viewPrsAckRefreshScriptTimeoutMs,
        });
        refreshedPrs.push(candidate.number);
      } catch (failure) {
        refreshErrors.push({
          prNumber: candidate.number,
          error: formatScriptFailureMessage(failure, "Refresh failed"),
        });
      }
    }

    return {
      refreshedPrs,
      refreshErrors,
    };
  };

  const buildRequestMoreSuccessActionLogEntry = ({
    timingContext,
    repo,
    requestCount,
    scannedCount,
    refreshedCount,
  }) => ({
    action: "post/merged/request-more",
    triggeredAt: timingContext.triggeredAt,
    durationMs: Date.now() - timingContext.startedAtMs,
    ok: true,
    detail: {
      repo,
      requestCount,
      scannedCount,
      refreshedCount,
    },
  });

  const buildRequestMoreFailureActionLogEntry = ({ timingContext, repo, error }) => ({
    action: "post/merged/request-more",
    triggeredAt: timingContext.triggeredAt,
    durationMs: Date.now() - timingContext.startedAtMs,
    ok: false,
    error,
    detail: { repo },
  });

  const buildRequestMoreSummary = (refreshedCount) =>
    refreshedCount > 0
      ? `Fetched ${refreshedCount} missing merged PR${refreshedCount === 1 ? "" : "s"}.`
      : "No missing merged PRs found in the scanned range.";

  const buildRequestMoreSuccessResult = ({
    repo,
    requestCount,
    scanLimit,
    mergedCandidates,
    missingCandidates,
    refreshedPrs,
    refreshErrors,
    prData,
  }) => ({
    responseStatusCode: 200,
    responsePayload: {
      ok: true,
      repo,
      requestCount,
      scanLimit,
      scannedCandidates: mergedCandidates.length,
      missingCandidates: missingCandidates.map((item) => item.number),
      refreshedPrs,
      refreshErrors,
      summary: buildRequestMoreSummary(refreshedPrs.length),
      prData,
    },
  });

  const buildRequestMoreFailureResult = (error) => {
    const message = error?.message || "Failed to request more merged PRs";
    return {
      responseStatusCode: 500,
      responsePayload: {
        ok: false,
        error: message,
      },
    };
  };

  const buildListRepoLabelsRequest = ({ query = {}, defaultViewPrsRepo }) => ({
    repo: toTrimmedString(query.repo) || defaultViewPrsRepo,
  });

  const buildListRepoLabelsInvalidRepoResult = (repo) => ({
    responseStatusCode: 400,
    responsePayload: {
      ok: false,
      error: `Invalid repo: ${repo}`,
    },
  });

  const buildListRepoLabelsSuccessResult = ({ repo, labels }) => ({
    responseStatusCode: 200,
    responsePayload: {
      ok: true,
      repo,
      labels,
    },
  });

  const buildListRepoLabelsFailureResult = (error) => ({
    responseStatusCode: 500,
    responsePayload: {
      ok: false,
      error: error?.message || "Failed to list labels",
    },
  });

  const buildApplyLabelRequest = ({ body = {}, defaultViewPrsRepo }) => ({
    repo: toTrimmedString(body.repo) || defaultViewPrsRepo,
    label: toTrimmedString(body.label),
    prNumbers: parseNumberCsv(body.prNumbers),
  });

  const buildApplyLabelBadRequestResult = (errorMessage) => ({
    responseStatusCode: 400,
    responsePayload: {
      ok: false,
      error: errorMessage,
    },
  });

  const buildApplyLabelMissingDependenciesResult = (missing) => ({
    responseStatusCode: 500,
    responsePayload: {
      ok: false,
      error: buildMissingDependenciesMessage(missing),
    },
  });

  const buildApplyLabelSuccessActionLogEntry = ({
    timingContext,
    repo,
    label,
    appliedPrs,
    applyErrors,
    refreshedPrs,
    refreshErrors,
  }) => ({
    action: "post/labels/apply",
    triggeredAt: timingContext.triggeredAt,
    durationMs: Date.now() - timingContext.startedAtMs,
    ok: applyErrors.length === 0,
    detail: {
      repo,
      label,
      appliedPrs,
      applyErrorCount: applyErrors.length,
      refreshedPrs,
      refreshErrorCount: refreshErrors.length,
    },
  });

  const buildApplyLabelFailureActionLogEntry = ({ timingContext, repo, label, error }) => ({
    action: "post/labels/apply",
    triggeredAt: timingContext.triggeredAt,
    durationMs: Date.now() - timingContext.startedAtMs,
    ok: false,
    error,
    detail: { repo, label },
  });

  const buildApplyLabelSummary = ({ label, appliedCount }) =>
    appliedCount > 0
      ? `Applied "${label}" to ${appliedCount} PR${appliedCount === 1 ? "" : "s"}.`
      : `No PRs were labeled with "${label}".`;

  const buildApplyLabelSuccessResult = ({
    repo,
    label,
    appliedPrs,
    applyErrors,
    refreshErrors,
    prData,
  }) => ({
    responseStatusCode: 200,
    responsePayload: {
      ok: true,
      repo,
      label,
      appliedPrs,
      applyErrors,
      refreshErrors,
      summary: buildApplyLabelSummary({ label, appliedCount: appliedPrs.length }),
      prData,
    },
  });

  const buildApplyLabelFailureResult = (error) => ({
    responseStatusCode: 500,
    responsePayload: {
      ok: false,
      error: error?.message || "Failed to apply label",
    },
  });

  return {
    createTimingContext,
    buildBadRequestResult,
    buildDisplayCommand,
    buildMissingDependenciesMessage,
    buildRunRequest,
    buildRunRequestDetail,
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
    parseNumberCsv,
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
    buildRequestMoreRefreshArgs,
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
  };
};

module.exports = {
  createViewPrsMutationRouteHelpers,
};