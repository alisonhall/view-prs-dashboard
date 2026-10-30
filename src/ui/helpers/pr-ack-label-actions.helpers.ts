import type { PrDataPayload } from "../types/pr-data.ts";
import type { AckRefreshWarningsSummary } from "./pr-ack-refresh-warnings.helpers.ts";
import type { CommandOutputOptions, CommandResult } from "./pr-command-output.helpers.ts";
import type { PostJsonResult } from "./pr-http.helpers.ts";

// Ack / Clear ack / Apply label requests (useAckLabelActions). Two kinds of
// caller use runAckOnlyWorkflow/runClearOnlyWorkflow/runApplyLabelWorkflow:
// PrTableApp's per-row Ack checkbox and Add-label select, and the Run &
// Filter tab's form buttons (which act on the "PR number(s)" field).
//
// UI feedback for bulk operations: runAckAction/runApplyLabelAction mark
// every PR number in the request "busy" (markPrsBusy/clearPrsBusy, which
// drive PrTableApp's per-row busy indicator) for the request's duration.
// A single-row action already gets this from PrTableApp's own withPrBusy
// wrapper (marking/clearing the same key twice is harmless - see
// markPrBusy/clearPrBusy's own prev.has() checks), but a bulk request from
// the Settings drawer's PR numbers field otherwise showed no
// per-row indicator at all for any of the PRs it affected.
//
// Chunked/parallel execution: a batch larger than CHUNK_SIZE is split into
// several smaller /view-prs/ack or /view-prs/labels/apply requests, run
// with at most CONCURRENCY_LIMIT in flight at once (via
// pr-concurrency.helpers.ts's runWithConcurrencyLimit - confirmed safe
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
// takes the single-request path (runSingleAckRequest/
// runSingleApplyLabelRequest) rather than going through the multi-chunk
// aggregation machinery, so that common case pays no extra cost (no extra
// network round-trip, same success/failure messaging). Only a genuine
// multi-chunk batch uses the aggregate-then-reload path, which
// deliberately does ONE loadStoredData call after all chunks settle
// rather than trying to merge N chunks' own prData responses - simpler and
// safer than partial in-memory merging, at the cost of one extra fetch for
// a multi-chunk batch specifically.
//
// Queued state: a multi-chunk batch marks every PR number queued
// (markPrsQueued) up front - distinct from busy, see PrTableApp.tsx/
// PrNumberCell.jsx's own comments - then each chunk moves its own PR
// numbers queued -> busy right before that chunk's request actually fires
// (only once a concurrency slot frees up via runWithConcurrencyLimit), not
// all at once. A single-chunk batch skips the queued state entirely and
// goes straight to busy - there's no meaningful "queued" phase when
// there's only ever going to be one request.
const CHUNK_SIZE = 5;
const CONCURRENCY_LIMIT = 3;

const chunkArray = <T>(items: T[] | null | undefined, size: number): T[][] => {
  const list = Array.isArray(items) ? items : [];
  const safeSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : list.length || 1;
  const chunks: T[][] = [];
  for (let i = 0; i < list.length; i += safeSize) {
    chunks.push(list.slice(i, i + safeSize));
  }
  return chunks;
};

export interface AckRequestPayload {
  repo?: string;
  ack?: string;
  ackClear?: string;
}

interface RefreshError {
  prNumber?: string | number;
  error?: string;
}

// What /view-prs/ack and /view-prs/labels/apply return.
interface AckLabelResult extends CommandResult {
  ok?: boolean;
  summary?: string;
  prData?: PrDataPayload;
  refreshErrors?: RefreshError[];
  applyErrors?: RefreshError[];
}

export interface AckLabelActionResult {
  payload: PrDataPayload | null | undefined;
  selectedRepo: string;
}

interface FailedChunk {
  prNumbers: string[];
  response?: Response;
  result?: AckLabelResult;
  error?: unknown;
}

type Notify = (title: string, detail: string, durationMs?: number) => void;
type PrSetMarker = (prNumbers: string[], repo: string | undefined) => void;

export interface PrAckLabelActionsDeps {
  postJson?: (url: string, payload: unknown) => Promise<PostJsonResult<AckLabelResult>>;
  setStatusMessage?: (message: string) => void;
  setOutputMessage?: (message: string) => void;
  beginRequestActivity?: (kind: string) => () => void;
  getGithubAuthFailureHint?: (result: CommandResult) => string;
  formatCommandOutput?: (result: CommandResult, options?: CommandOutputOptions) => string;
  formatCommandOutputWithAuthHint?: (result: CommandResult, options?: CommandOutputOptions) => string;
  showErrorNotification?: Notify;
  showWarningNotification?: Notify;
  summarizeAckRefreshWarnings?: (refreshErrors: unknown) => AckRefreshWarningsSummary | null;
  applyFreshPrPayload?: (payload: PrDataPayload, repo: string) => void;
  loadStoredData?: (repo: string) => Promise<unknown>;
  getFormBody?: () => { repo?: string; prNumbers?: string };
  defaultRepo?: string;
  parseCsvTokens?: (rawValue: unknown) => string[];
  markPrsBusy?: PrSetMarker;
  clearPrsBusy?: PrSetMarker;
  markPrsQueued?: PrSetMarker;
  clearPrsQueued?: PrSetMarker;
  // Surface a multi-chunk batch's chunk order/progress in the activity
  // drawer's queue section. Only called for a genuine multi-chunk batch
  // (a single-chunk batch never calls them, matching beginBatch's own
  // single-chunk no-op in pr-bulk-action-batches.helpers.ts).
  beginBulkActionBatch?: (batch: { batchId: string; actionLabel: string; repo?: string; chunks: string[][] }) => void;
  markBulkActionChunkInFlight?: (chunk: { batchId: string; chunkIndex: number }) => void;
  markBulkActionChunkDone?: (chunk: { batchId: string; chunkIndex: number; ok: boolean }) => void;
  finishBulkActionBatch?: (batch: { batchId: string }) => void;
  runWithConcurrencyLimit?: <I, R>(
    items: I[],
    limit: number,
    worker: (item: I, index: number) => Promise<R>,
  ) => Promise<unknown[]>;
  // Reads back the payload loadStoredData just stored, for the
  // loadStoredData fallback branches below.
  getLatestStoredPayload?: () => PrDataPayload | null | undefined;
}

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
  applyFreshPrPayload,
  loadStoredData,
  getFormBody,
  defaultRepo,
  parseCsvTokens,
  markPrsBusy,
  clearPrsBusy,
  markPrsQueued,
  clearPrsQueued,
  beginBulkActionBatch,
  markBulkActionChunkInFlight,
  markBulkActionChunkDone,
  finishBulkActionBatch,
  runWithConcurrencyLimit,
  getLatestStoredPayload,
}: PrAckLabelActionsDeps = {}) => {
  // Without postJson, behave like a failed request (a plain object stands
  // in for the Response, as before conversion).
  const postJsonSafe =
    typeof postJson === "function"
      ? postJson
      : async (): Promise<PostJsonResult<AckLabelResult>> => ({
          response: { ok: false } as Response,
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
  const applyFreshPrPayloadSafe =
    typeof applyFreshPrPayload === "function" ? applyFreshPrPayload : () => {};
  const loadStoredDataSafe = typeof loadStoredData === "function" ? loadStoredData : async () => {};
  const getFormBodySafe =
    typeof getFormBody === "function" ? getFormBody : (): { repo?: string; prNumbers?: string } => ({});
  const defaultRepoSafe = typeof defaultRepo === "string" ? defaultRepo : "";
  const parseCsvTokensSafe =
    typeof parseCsvTokens === "function"
      ? parseCsvTokens
      : (rawValue: unknown) => String(rawValue || "").split(",").map((token) => token.trim()).filter(Boolean);
  const markPrsBusySafe: PrSetMarker = typeof markPrsBusy === "function" ? markPrsBusy : () => {};
  const clearPrsBusySafe: PrSetMarker = typeof clearPrsBusy === "function" ? clearPrsBusy : () => {};
  const markPrsQueuedSafe: PrSetMarker = typeof markPrsQueued === "function" ? markPrsQueued : () => {};
  const clearPrsQueuedSafe: PrSetMarker = typeof clearPrsQueued === "function" ? clearPrsQueued : () => {};
  const beginBulkActionBatchSafe =
    typeof beginBulkActionBatch === "function" ? beginBulkActionBatch : () => {};
  const markBulkActionChunkInFlightSafe =
    typeof markBulkActionChunkInFlight === "function" ? markBulkActionChunkInFlight : () => {};
  const markBulkActionChunkDoneSafe =
    typeof markBulkActionChunkDone === "function" ? markBulkActionChunkDone : () => {};
  const finishBulkActionBatchSafe =
    typeof finishBulkActionBatch === "function" ? finishBulkActionBatch : () => {};
  const generateBulkActionBatchId = (): string =>
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Without the real runner, runs the chunks one at a time.
  const runWithConcurrencyLimitSafe =
    typeof runWithConcurrencyLimit === "function"
      ? runWithConcurrencyLimit
      : async <I, R>(items: I[], _limit: number, worker: (item: I, index: number) => Promise<R>): Promise<unknown[]> => {
          const list = Array.isArray(items) ? items : [];
          const results: unknown[] = [];
          for (const item of list) {
            try {
              results.push(await (worker as (item: I) => Promise<R>)(item));
            } catch (error) {
              results.push({ ok: false, error });
            }
          }
          return results;
        };
  const getLatestStoredPayloadSafe =
    typeof getLatestStoredPayload === "function" ? getLatestStoredPayload : () => null;

  // The single-request path, used whenever a batch fits in one chunk (see
  // the module-level comment). Every exit returns null (failure) or
  // { payload, selectedRepo } (success) - see
  // pr-row-checkbox-actions.helpers.ts's comment for why.
  const runSingleAckRequest = async (
    payload: AckRequestPayload,
    actionLabel: string,
  ): Promise<AckLabelActionResult | null> => {
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
        applyFreshPrPayloadSafe(result.prData, selectedRepo);
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

  // The multi-chunk aggregation path - only reached for a batch larger
  // than CHUNK_SIZE. Every chunk runs regardless of an earlier chunk's
  // outcome (no early return on failure, unlike the single-request path
  // above), then one combined summary is shown at the end.
  const runChunkedAckRequest = async (
    actionLabel: string,
    chunks: string[][],
    isClear: boolean,
    repo: string | undefined,
  ): Promise<AckLabelActionResult | null> => {
    let completedChunks = 0;
    const failedChunks: FailedChunk[] = [];
    const allRefreshErrors: RefreshError[] = [];
    // Collected across every successful chunk, not just the last one to
    // resolve - a chunk-count-many response bodies each have their own
    // command output, and showing only the last chunk's would silently
    // drop the others (found during a post-hoc review of this feature).
    const successfulChunkOutputs: string[] = [];

    const batchId = generateBulkActionBatchId();
    beginBulkActionBatchSafe({ batchId, actionLabel, repo, chunks });

    try {
      await runWithConcurrencyLimitSafe(chunks, CONCURRENCY_LIMIT, async (chunkPrNumbers: string[], chunkIndex: number) => {
        clearPrsQueuedSafe(chunkPrNumbers, repo);
        markPrsBusySafe(chunkPrNumbers, repo);
        markBulkActionChunkInFlightSafe({ batchId, chunkIndex });
        const chunkPayload = {
          repo,
          [isClear ? "ackClear" : "ack"]: chunkPrNumbers.join(","),
        };
        let chunkOk = true;
        try {
          const { response, result } = await postJsonSafe("/view-prs/ack", chunkPayload);
          if (!response.ok || result.ok === false) {
            failedChunks.push({ prNumbers: chunkPrNumbers, response, result });
            chunkOk = false;
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
          chunkOk = false;
        } finally {
          clearPrsBusySafe(chunkPrNumbers, repo);
          markBulkActionChunkDoneSafe({ batchId, chunkIndex, ok: chunkOk });
          completedChunks += 1;
          setStatusMessageSafe(`${actionLabel}: ${completedChunks} of ${chunks.length} chunks done...`);
        }
      });
    } finally {
      finishBulkActionBatchSafe({ batchId });
    }

    const totalPrCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const failedPrCount = failedChunks.reduce((sum, entry) => sum + entry.prNumbers.length, 0);
    const succeededPrCount = totalPrCount - failedPrCount;

    if (failedChunks.length === chunks.length) {
      // Every chunk failed, so there's at least one entry.
      const first = failedChunks[0] as FailedChunk;
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

  const runAckAction = async (
    payload: AckRequestPayload,
    actionLabel: string,
  ): Promise<AckLabelActionResult | null> => {
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

  const runAckOnlyWorkflow = async (
    ackValue: string = "",
    repoOverride: string = "",
  ): Promise<AckLabelActionResult | null> => {
    const body = getFormBodySafe();

    const ack = String(ackValue || body.prNumbers || "").trim();
    if (!ack) {
      setStatusMessageSafe('Ack only requires numeric value(s) in "PR number(s)"');
      return null;
    }

    const repo = String(repoOverride || body.repo || "").trim();
    return await runAckAction({ repo, ack }, "Ack only");
  };

  const runClearOnlyWorkflow = async (
    ackClearValue: string = "",
    repoOverride: string = "",
  ): Promise<AckLabelActionResult | null> => {
    const body = getFormBodySafe();

    const ackClear = String(ackClearValue || body.prNumbers || "").trim();
    if (!ackClear) {
      setStatusMessageSafe('Clear only requires numeric value(s) in "PR number(s)"');
      return null;
    }

    const repo = String(repoOverride || body.repo || "").trim();
    return await runAckAction({ repo, ackClear }, "Clear only");
  };

  // The single-request path, used whenever a batch fits in one chunk (see
  // the module-level comment).
  const runSingleApplyLabelRequest = async (
    { repo, label, prNumbers }: { repo?: string; label: string; prNumbers: string },
    actionLabel: string,
  ): Promise<AckLabelActionResult | null> => {
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
        applyFreshPrPayloadSafe(result.prData, selectedRepo);
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

  // The multi-chunk aggregation path - only reached for a batch larger
  // than CHUNK_SIZE. Every chunk runs regardless of an earlier chunk's
  // outcome (no early return on failure, unlike the single-request path
  // above), then one combined summary is shown at the end.
  const runChunkedApplyLabelRequest = async (
    actionLabel: string,
    chunks: string[][],
    label: string,
    repo: string | undefined,
  ): Promise<AckLabelActionResult | null> => {
    let completedChunks = 0;
    const failedChunks: FailedChunk[] = [];
    const allCombinedErrors: RefreshError[] = [];

    const batchId = generateBulkActionBatchId();
    beginBulkActionBatchSafe({ batchId, actionLabel, repo, chunks });

    try {
      await runWithConcurrencyLimitSafe(chunks, CONCURRENCY_LIMIT, async (chunkPrNumbers: string[], chunkIndex: number) => {
        clearPrsQueuedSafe(chunkPrNumbers, repo);
        markPrsBusySafe(chunkPrNumbers, repo);
        markBulkActionChunkInFlightSafe({ batchId, chunkIndex });
        let chunkOk = true;
        try {
          const { response, result } = await postJsonSafe("/view-prs/labels/apply", {
            repo,
            label,
            prNumbers: chunkPrNumbers.join(","),
          });
          if (!response.ok || result.ok === false) {
            failedChunks.push({ prNumbers: chunkPrNumbers, response, result });
            chunkOk = false;
          } else {
            allCombinedErrors.push(
              ...(Array.isArray(result.applyErrors) ? result.applyErrors : []),
              ...(Array.isArray(result.refreshErrors) ? result.refreshErrors : []),
            );
          }
        } catch (error) {
          failedChunks.push({ prNumbers: chunkPrNumbers, error });
          chunkOk = false;
        } finally {
          clearPrsBusySafe(chunkPrNumbers, repo);
          markBulkActionChunkDoneSafe({ batchId, chunkIndex, ok: chunkOk });
          completedChunks += 1;
          setStatusMessageSafe(`${actionLabel}: ${completedChunks} of ${chunks.length} chunks done...`);
        }
      });
    } finally {
      finishBulkActionBatchSafe({ batchId });
    }

    const totalPrCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const failedPrCount = failedChunks.reduce((sum, entry) => sum + entry.prNumbers.length, 0);
    const succeededPrCount = totalPrCount - failedPrCount;

    if (failedChunks.length === chunks.length) {
      // Every chunk failed, so there's at least one entry.
      const first = failedChunks[0] as FailedChunk;
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

    const combinedErrors: RefreshError[] = [
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

  const runApplyLabelAction = async (
    { repo, label, prNumbers }: { repo?: string; label: string; prNumbers: string },
    actionLabel: string,
  ): Promise<AckLabelActionResult | null> => {
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

  const runApplyLabelWorkflow = async (
    prNumbersValue: string = "",
    labelValue: string = "",
    repoOverride: string = "",
  ): Promise<AckLabelActionResult | null> => {
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

export { createPrAckLabelActionsHelpers };
