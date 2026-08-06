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
    parseNumberCsv,
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
    buildRequestMoreRefreshArgs,
    runRequestMoreRefreshes,
    buildRequestMoreSuccessActionLogEntry,
    buildRequestMoreFailureActionLogEntry,
    buildRequestMoreSuccessResult,
    buildRequestMoreFailureResult,
  };
};

module.exports = {
  createViewPrsMutationRouteHelpers,
};