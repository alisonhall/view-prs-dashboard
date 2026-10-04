// Phase 7, sub-phase 7.3 (revised scope - see REACT_MIGRATION_PLAN.md): pure
// extraction of index.page.js's former runAckAction/runAckOnlyWorkflow/
// runClearOnlyWorkflow/runApplyLabelAction/runApplyLabelWorkflow function
// bodies into a DI-factory module, matching the pattern every other complex
// index.page.js function already uses (e.g. pr-single-pr-update.helpers.js,
// pr-data-polling-orchestration.helpers.js, pr-row-checkbox-actions.helpers.js).
// This is a byte-for-byte-logic-preserving move, not a rewrite.
//
// runAckOnlyWorkflow/runClearOnlyWorkflow/runApplyLabelWorkflow have two
// callers each, both kept working unchanged by this extraction:
// react-callbacks.helpers.js's handleAckAction/handleApplyLabel (the React
// checkbox/apply-label-select path), and index.page.js's own
// handleAckOnly/handleClearOnly/handleApplyLabelClick (the vanilla "Run &
// Filter" tab's form buttons) - both still call these same-named,
// now-thin-wrapper functions in index.page.js exactly as before.
//
// UI feedback for bulk operations (follow-up, see REACT_MIGRATION_PLAN.md):
// runAckAction/runApplyLabelAction mark every PR number in the request
// "busy" (via markPrsBusy/clearPrsBusy, bridged to PrTableApp.jsx's
// existing per-row busyPrNumbers Set - see that component's own comment)
// for the request's duration. This covers both callers: a single-row
// action already gets this from PrTableApp's own withPrBusy wrapper
// (marking/clearing the same key is a harmless no-op duplicate - see
// markPrBusy/clearPrBusy's own prev.has() checks), but a bulk request from
// the "Run & Filter" tab's PR-number-list field previously showed no
// per-row indicator at all for any of the PRs it affected.
//
// Chunked/parallel execution (follow-up, see the saved plan and
// REACT_MIGRATION_PLAN.md): a batch larger than CHUNK_SIZE is split into
// several smaller /view-prs/ack or /view-prs/labels/apply requests, run
// with at most CONCURRENCY_LIMIT in flight at once (via
// pr-concurrency.helpers.js's runWithConcurrencyLimit - confirmed safe
// against the server's existing PR-state/user-state lockfiles before
// building this, see check-open-pr-updates.sh's with_pr_state_lock/
// with_user_state_lock). Each chunk clears its own PR numbers' busy state
// as soon as ITS request resolves (not all at once at the very end), which
// is what actually produces the incremental "done so far" feedback on the
// table - no new busy-tracking code needed, markPrsBusy/clearPrsBusy
// already accept arbitrary PR-number arrays.
//
// A batch that fits in one chunk (chunks.length <= 1 - true for every
// single-row Ack/Apply-label click, by far the most common call pattern)
// takes the original, unchanged single-request code path below
// (runSingleAckRequest/runSingleApplyLabelRequest) rather than going
// through the multi-chunk aggregation machinery, so that common case pays
// no new cost (no extra network round-trip, same success/failure
// messaging as before this feature existed). Only a genuine multi-chunk
// batch uses the new aggregate-then-reload path, which deliberately does
// ONE loadStoredData call after all chunks settle rather than trying to
// merge N chunks' own prData responses - simpler and safer than partial
// in-memory merging, at the cost of one extra fetch for a multi-chunk
// batch specifically (not for the common single-request case).
//
// Queued state (follow-up, see the saved plan): a multi-chunk batch marks
// every PR number queued (markPrsQueued) up front - distinct from busy,
// see PrTableApp.jsx/PrNumberCell.jsx's own comments - then each chunk
// moves its own PR numbers queued -> busy right before that chunk's
// request actually fires (only once a concurrency slot frees up via
// runWithConcurrencyLimit), not all at once. A single-chunk batch skips
// the queued state entirely and goes straight to busy, same as before this
// state existed - there's no meaningful "queued" phase when there's only
// ever going to be one request.
export const { createPrAckLabelActionsHelpers } = (() => {
  const CHUNK_SIZE = 5;
  const CONCURRENCY_LIMIT = 3;

  const chunkArray = (items, size) => {
    const list = Array.isArray(items) ? items : [];
    const safeSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : list.length || 1;
    const chunks = [];
    for (let i = 0; i < list.length; i += safeSize) {
      chunks.push(list.slice(i, i + safeSize));
    }
    return chunks;
  };

  const createPrAckLabelActionsHelpers = ({
    postJson,
    setStatusMessage,
    setOutputMessage,
    beginRequestActivity,
    getGithubAuthFailureHint,
    formatCommandOutput,
    formatCommandOutputWithAuthHint,
    showErrorNotification,
    showWarningNotification,
    summarizeAckRefreshWarnings,
    renderPrData,
    loadStoredData,
    getFormBody,
    defaultRepo,
    parseCsvTokens,
    markPrsBusy,
    clearPrsBusy,
    markPrsQueued,
    clearPrsQueued,
    runWithConcurrencyLimit,
    // Phase 7, sub-phase 7.3 follow-up (see REACT_MIGRATION_PLAN.md): only
    // needed for the loadStoredData-fallback branches below, to read back
    // the payload loadStoredData itself just wrote via applyLatestPrData -
    // a synchronous read strictly after that write has already completed,
    // not the same-tick-as-mutation hazard this whole effort removes.
    getLatestStoredPayload,
  } = {}) => {
    const postJsonSafe = typeof postJson === "function" ? postJson : async () => ({
      response: { ok: false },
      result: { ok: false, error: "postJson is not available" },
    });
    const setStatusMessageSafe = typeof setStatusMessage === "function" ? setStatusMessage : () => {};
    const setOutputMessageSafe = typeof setOutputMessage === "function" ? setOutputMessage : () => {};
    const beginRequestActivitySafe =
      typeof beginRequestActivity === "function" ? beginRequestActivity : () => () => {};
    const getGithubAuthFailureHintSafe =
      typeof getGithubAuthFailureHint === "function" ? getGithubAuthFailureHint : () => "";
    const formatCommandOutputSafe =
      typeof formatCommandOutput === "function" ? formatCommandOutput : () => "";
    const formatCommandOutputWithAuthHintSafe =
      typeof formatCommandOutputWithAuthHint === "function" ? formatCommandOutputWithAuthHint : () => "";
    const showErrorNotificationSafe =
      typeof showErrorNotification === "function" ? showErrorNotification : () => {};
    const showWarningNotificationSafe =
      typeof showWarningNotification === "function" ? showWarningNotification : () => {};
    const summarizeAckRefreshWarningsSafe =
      typeof summarizeAckRefreshWarnings === "function" ? summarizeAckRefreshWarnings : () => null;
    const renderPrDataSafe = typeof renderPrData === "function" ? renderPrData : () => {};
    const loadStoredDataSafe = typeof loadStoredData === "function" ? loadStoredData : async () => {};
    const getFormBodySafe = typeof getFormBody === "function" ? getFormBody : () => ({});
    const defaultRepoSafe = typeof defaultRepo === "string" ? defaultRepo : "";
    const parseCsvTokensSafe =
      typeof parseCsvTokens === "function"
        ? parseCsvTokens
        : (rawValue) => String(rawValue || "").split(",").map((token) => token.trim()).filter(Boolean);
    const markPrsBusySafe = typeof markPrsBusy === "function" ? markPrsBusy : () => {};
    const clearPrsBusySafe = typeof clearPrsBusy === "function" ? clearPrsBusy : () => {};
    const markPrsQueuedSafe = typeof markPrsQueued === "function" ? markPrsQueued : () => {};
    const clearPrsQueuedSafe = typeof clearPrsQueued === "function" ? clearPrsQueued : () => {};
    const runWithConcurrencyLimitSafe =
      typeof runWithConcurrencyLimit === "function"
        ? runWithConcurrencyLimit
        : async (items, _limit, worker) => {
            const list = Array.isArray(items) ? items : [];
            const results = [];
            for (const item of list) {
              try {
                results.push(await worker(item));
              } catch (error) {
                results.push({ ok: false, error });
              }
            }
            return results;
          };
    const getLatestStoredPayloadSafe =
      typeof getLatestStoredPayload === "function" ? getLatestStoredPayload : () => null;

    // The original, single-request code path - unchanged behavior, used
    // whenever a batch fits in one chunk (see the module-level comment).
    // Phase 7, sub-phase 7.3 follow-up (see REACT_MIGRATION_PLAN.md): every
    // exit point now returns null (failure) or { payload, selectedRepo }
    // (success) - see pr-row-checkbox-actions.helpers.js's own comment for
    // why, same reasoning applies here.
    const runSingleAckRequest = async (payload, actionLabel) => {
      try {
        const { response, result } = await postJsonSafe("/view-prs/ack", payload);

        if (!response.ok || result.ok === false) {
          const authHint = getGithubAuthFailureHintSafe(result);
          setStatusMessageSafe(
            authHint
              ? `Failed (${response.status}) - GitHub auth required`
              : `Failed (${response.status})`,
          );
          setOutputMessageSafe(formatCommandOutputWithAuthHintSafe(result));
          showErrorNotificationSafe(
            `${actionLabel} failed`,
            authHint
              ? "GitHub authentication or SSO required. Check the output below for authorization link."
              : `HTTP ${response.status}: Check the output below for details.`,
            0,
          );
          return null;
        }

        setStatusMessageSafe(`${actionLabel} completed`);
        setOutputMessageSafe(
          formatCommandOutputSafe(result, { includeError: false }) ||
            `${actionLabel} completed.`,
        );

        const warningSummary = summarizeAckRefreshWarningsSafe(result?.refreshErrors);
        if (warningSummary) {
          showWarningNotificationSafe(
            `${actionLabel} completed with warnings (${warningSummary.summaryText})`,
            warningSummary.sample,
          );
        }

        const selectedRepo = payload.repo || defaultRepoSafe;
        if (result.prData) {
          renderPrDataSafe(result.prData, selectedRepo);
          return { payload: result.prData, selectedRepo };
        } else {
          await loadStoredDataSafe(selectedRepo);
          return { payload: getLatestStoredPayloadSafe(), selectedRepo };
        }
      } catch (error) {
        setStatusMessageSafe("Failed (network/error)");
        setOutputMessageSafe(String(error));
        showErrorNotificationSafe(
          `${actionLabel} failed`,
          String(error || "An unknown error occurred"),
          0,
        );
        return null;
      }
    };

    // New multi-chunk aggregation path - only reached for a batch larger
    // than CHUNK_SIZE. Every chunk runs regardless of an earlier chunk's
    // outcome (no early return on failure, unlike the single-request path
    // above), then one combined summary is shown at the end.
    const runChunkedAckRequest = async (actionLabel, chunks, isClear, repo) => {
      let completedChunks = 0;
      const failedChunks = [];
      const allRefreshErrors = [];
      // Collected across every successful chunk, not just the last one to
      // resolve - a chunk-count-many response bodies each have their own
      // command output, and showing only the last chunk's would silently
      // drop the others (found during a post-hoc review of this feature).
      const successfulChunkOutputs = [];

      await runWithConcurrencyLimitSafe(chunks, CONCURRENCY_LIMIT, async (chunkPrNumbers) => {
        clearPrsQueuedSafe(chunkPrNumbers, repo);
        markPrsBusySafe(chunkPrNumbers, repo);
        const chunkPayload = {
          repo,
          [isClear ? "ackClear" : "ack"]: chunkPrNumbers.join(","),
        };
        try {
          const { response, result } = await postJsonSafe("/view-prs/ack", chunkPayload);
          if (!response.ok || result.ok === false) {
            failedChunks.push({ prNumbers: chunkPrNumbers, response, result });
          } else {
            const formattedOutput = formatCommandOutputSafe(result, { includeError: false });
            if (formattedOutput) {
              successfulChunkOutputs.push(`PR(s) ${chunkPrNumbers.join(", ")}:\n${formattedOutput}`);
            }
            if (Array.isArray(result?.refreshErrors)) {
              allRefreshErrors.push(...result.refreshErrors);
            }
          }
        } catch (error) {
          failedChunks.push({ prNumbers: chunkPrNumbers, error });
        } finally {
          clearPrsBusySafe(chunkPrNumbers, repo);
          completedChunks += 1;
          setStatusMessageSafe(`${actionLabel}: ${completedChunks} of ${chunks.length} chunks done...`);
        }
      });

      const totalPrCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const failedPrCount = failedChunks.reduce((sum, entry) => sum + entry.prNumbers.length, 0);
      const succeededPrCount = totalPrCount - failedPrCount;

      if (failedChunks.length === chunks.length) {
        const first = failedChunks[0];
        const authHint = first.result ? getGithubAuthFailureHintSafe(first.result) : "";
        setStatusMessageSafe(
          first.response
            ? authHint
              ? `Failed (${first.response.status}) - GitHub auth required`
              : `Failed (${first.response.status})`
            : "Failed (network/error)",
        );
        setOutputMessageSafe(
          first.result ? formatCommandOutputWithAuthHintSafe(first.result) : String(first.error || ""),
        );
        showErrorNotificationSafe(
          `${actionLabel} failed`,
          authHint
            ? "GitHub authentication or SSO required. Check the output below for authorization link."
            : first.response
              ? `HTTP ${first.response.status}: Check the output below for details.`
              : String(first.error || "An unknown error occurred"),
          0,
        );
        return null;
      }

      if (failedChunks.length > 0) {
        setStatusMessageSafe(
          `${actionLabel} completed with failures (${succeededPrCount} of ${totalPrCount} PR(s) succeeded)`,
        );
        showWarningNotificationSafe(
          `${actionLabel} completed with ${failedChunks.length} of ${chunks.length} chunk(s) failing`,
          failedChunks
            .map(
              (entry) =>
                `PR(s) ${entry.prNumbers.join(", ")}: ${entry.result?.error || entry.error || "request failed"}`,
            )
            .join("\n"),
        );
      } else {
        setStatusMessageSafe(`${actionLabel} completed (${totalPrCount} PR(s))`);
      }

      if (successfulChunkOutputs.length) {
        setOutputMessageSafe(successfulChunkOutputs.join("\n\n"));
      }

      const warningSummary = summarizeAckRefreshWarningsSafe(allRefreshErrors);
      if (warningSummary) {
        showWarningNotificationSafe(
          `${actionLabel} completed with warnings (${warningSummary.summaryText})`,
          warningSummary.sample,
        );
      }

      const selectedRepo = repo || defaultRepoSafe;
      await loadStoredDataSafe(selectedRepo);
      return { payload: getLatestStoredPayloadSafe(), selectedRepo };
    };

    const runAckAction = async (payload, actionLabel) => {
      setStatusMessageSafe(`${actionLabel}...`);
      setOutputMessageSafe("");
      const finishActivity = beginRequestActivitySafe("ackClear");
      const isClear = Boolean(payload && Object.prototype.hasOwnProperty.call(payload, "ackClear"));
      const prNumbers = parseCsvTokensSafe(payload?.ack || payload?.ackClear || "");
      const repo = payload?.repo;
      const chunks = chunkArray(prNumbers, CHUNK_SIZE);

      try {
        if (chunks.length <= 1) {
          markPrsBusySafe(prNumbers, repo);
          try {
            return await runSingleAckRequest(payload, actionLabel);
          } finally {
            clearPrsBusySafe(prNumbers, repo);
          }
        } else {
          markPrsQueuedSafe(prNumbers, repo);
          return await runChunkedAckRequest(actionLabel, chunks, isClear, repo);
        }
      } finally {
        finishActivity();
      }
    };

    const runAckOnlyWorkflow = async (ackValue = "", repoOverride = "") => {
      const body = getFormBodySafe();

      const ack = String(ackValue || body.prNumbers || "").trim();
      if (!ack) {
        setStatusMessageSafe('Ack only requires numeric value(s) in "PR number(s)"');
        return null;
      }

      const repo = String(repoOverride || body.repo || "").trim();
      return await runAckAction({ repo, ack }, "Ack only");
    };

    const runClearOnlyWorkflow = async (ackClearValue = "", repoOverride = "") => {
      const body = getFormBodySafe();

      const ackClear = String(ackClearValue || body.prNumbers || "").trim();
      if (!ackClear) {
        setStatusMessageSafe('Clear only requires numeric value(s) in "PR number(s)"');
        return null;
      }

      const repo = String(repoOverride || body.repo || "").trim();
      return await runAckAction({ repo, ackClear }, "Clear only");
    };

    // The original, single-request code path - unchanged behavior, used
    // whenever a batch fits in one chunk (see the module-level comment).
    const runSingleApplyLabelRequest = async ({ repo, label, prNumbers }, actionLabel) => {
      try {
        const { response, result } = await postJsonSafe("/view-prs/labels/apply", {
          repo,
          label,
          prNumbers,
        });

        if (!response.ok || result.ok === false) {
          const authHint = getGithubAuthFailureHintSafe(result);
          setStatusMessageSafe(
            authHint
              ? `Failed (${response.status}) - GitHub auth required`
              : `Failed (${response.status})`,
          );
          setOutputMessageSafe(formatCommandOutputWithAuthHintSafe(result));
          showErrorNotificationSafe(
            `${actionLabel} failed`,
            authHint
              ? "GitHub authentication or SSO required. Check the output below for authorization link."
              : String(result?.error || `HTTP ${response.status}: Check the output below for details.`),
            0,
          );
          return null;
        }

        setStatusMessageSafe(result.summary || `${actionLabel} completed`);

        const combinedErrors = [
          ...(Array.isArray(result.applyErrors) ? result.applyErrors : []),
          ...(Array.isArray(result.refreshErrors) ? result.refreshErrors : []),
        ];
        if (combinedErrors.length) {
          showWarningNotificationSafe(
            `${actionLabel} completed with ${combinedErrors.length} error(s)`,
            combinedErrors
              .map((entry) => `#${entry.prNumber}: ${entry.error}`)
              .join("\n"),
          );
        }

        const selectedRepo = repo || defaultRepoSafe;
        if (result.prData) {
          renderPrDataSafe(result.prData, selectedRepo);
          return { payload: result.prData, selectedRepo };
        } else {
          await loadStoredDataSafe(selectedRepo);
          return { payload: getLatestStoredPayloadSafe(), selectedRepo };
        }
      } catch (error) {
        setStatusMessageSafe("Failed (network/error)");
        setOutputMessageSafe(String(error));
        showErrorNotificationSafe(
          `${actionLabel} failed`,
          String(error || "An unknown error occurred"),
          0,
        );
        return null;
      }
    };

    // New multi-chunk aggregation path - only reached for a batch larger
    // than CHUNK_SIZE. Every chunk runs regardless of an earlier chunk's
    // outcome (no early return on failure, unlike the single-request path
    // above), then one combined summary is shown at the end.
    const runChunkedApplyLabelRequest = async (actionLabel, chunks, label, repo) => {
      let completedChunks = 0;
      const failedChunks = [];
      const allCombinedErrors = [];

      await runWithConcurrencyLimitSafe(chunks, CONCURRENCY_LIMIT, async (chunkPrNumbers) => {
        clearPrsQueuedSafe(chunkPrNumbers, repo);
        markPrsBusySafe(chunkPrNumbers, repo);
        try {
          const { response, result } = await postJsonSafe("/view-prs/labels/apply", {
            repo,
            label,
            prNumbers: chunkPrNumbers.join(","),
          });
          if (!response.ok || result.ok === false) {
            failedChunks.push({ prNumbers: chunkPrNumbers, response, result });
          } else {
            allCombinedErrors.push(
              ...(Array.isArray(result.applyErrors) ? result.applyErrors : []),
              ...(Array.isArray(result.refreshErrors) ? result.refreshErrors : []),
            );
          }
        } catch (error) {
          failedChunks.push({ prNumbers: chunkPrNumbers, error });
        } finally {
          clearPrsBusySafe(chunkPrNumbers, repo);
          completedChunks += 1;
          setStatusMessageSafe(`${actionLabel}: ${completedChunks} of ${chunks.length} chunks done...`);
        }
      });

      const totalPrCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const failedPrCount = failedChunks.reduce((sum, entry) => sum + entry.prNumbers.length, 0);
      const succeededPrCount = totalPrCount - failedPrCount;

      if (failedChunks.length === chunks.length) {
        const first = failedChunks[0];
        const authHint = first.result ? getGithubAuthFailureHintSafe(first.result) : "";
        setStatusMessageSafe(
          first.response
            ? authHint
              ? `Failed (${first.response.status}) - GitHub auth required`
              : `Failed (${first.response.status})`
            : "Failed (network/error)",
        );
        setOutputMessageSafe(
          first.result ? formatCommandOutputWithAuthHintSafe(first.result) : String(first.error || ""),
        );
        showErrorNotificationSafe(
          `${actionLabel} failed`,
          authHint
            ? "GitHub authentication or SSO required. Check the output below for authorization link."
            : first.response
              ? `HTTP ${first.response.status}: Check the output below for details.`
              : String(first.error || "An unknown error occurred"),
          0,
        );
        return null;
      }

      if (failedChunks.length > 0) {
        setStatusMessageSafe(
          `${actionLabel} completed with failures (${succeededPrCount} of ${totalPrCount} PR(s) succeeded)`,
        );
      } else {
        setStatusMessageSafe(`${actionLabel} completed (${totalPrCount} PR(s))`);
      }

      const combinedErrors = [
        ...allCombinedErrors,
        ...failedChunks.map((entry) => ({
          prNumber: entry.prNumbers.join(", "),
          error: entry.result?.error || String(entry.error || "request failed"),
        })),
      ];
      if (combinedErrors.length) {
        showWarningNotificationSafe(
          `${actionLabel} completed with ${combinedErrors.length} error(s)`,
          combinedErrors.map((entry) => `#${entry.prNumber}: ${entry.error}`).join("\n"),
        );
      }

      const selectedRepo = repo || defaultRepoSafe;
      await loadStoredDataSafe(selectedRepo);
      return { payload: getLatestStoredPayloadSafe(), selectedRepo };
    };

    const runApplyLabelAction = async ({ repo, label, prNumbers }, actionLabel) => {
      setStatusMessageSafe(`${actionLabel}...`);
      setOutputMessageSafe("");
      const finishActivity = beginRequestActivitySafe("labelApply");
      const prNumberList = parseCsvTokensSafe(prNumbers);
      const chunks = chunkArray(prNumberList, CHUNK_SIZE);

      try {
        if (chunks.length <= 1) {
          markPrsBusySafe(prNumberList, repo);
          try {
            return await runSingleApplyLabelRequest({ repo, label, prNumbers }, actionLabel);
          } finally {
            clearPrsBusySafe(prNumberList, repo);
          }
        } else {
          markPrsQueuedSafe(prNumberList, repo);
          return await runChunkedApplyLabelRequest(actionLabel, chunks, label, repo);
        }
      } finally {
        finishActivity();
      }
    };

    const runApplyLabelWorkflow = async (prNumbersValue = "", labelValue = "", repoOverride = "") => {
      const body = getFormBodySafe();

      const prNumbers = String(prNumbersValue || body.prNumbers || "").trim();
      if (!prNumbers) {
        setStatusMessageSafe('Apply label requires numeric value(s) in "PR number(s)"');
        return null;
      }

      const label = String(labelValue || "").trim();
      if (!label) {
        setStatusMessageSafe("Choose a label to apply");
        return null;
      }

      const repo = String(repoOverride || body.repo || "").trim();
      return await runApplyLabelAction({ repo, label, prNumbers }, "Apply label");
    };

    return {
      runAckAction,
      runAckOnlyWorkflow,
      runClearOnlyWorkflow,
      runApplyLabelAction,
      runApplyLabelWorkflow,
    };
  };

  return {
    createPrAckLabelActionsHelpers,
  };
})();
