import type { BackfillButtonState, BackfillStatus } from "./pr-backfill.helpers.ts";
import type { CommandOutputOptions, CommandResult } from "./pr-command-output.helpers.ts";
import type { PostJsonResult } from "./pr-http.helpers.ts";

// Settings › Backfill's server calls: loading the status and log tail
// (BackfillStatusProvider uses loadBackfillStatus), and starting/stopping
// the backfill with status text, output, button state and the failure
// snackbar kept in step (useBackfillActions).
interface BackfillLogResult {
  ok?: boolean;
  error?: string;
  summary?: string;
  tail?: string;
}

type BackfillActionResult = BackfillStatus & CommandResult & { summary?: string };

// Each function needs only some of these, and callers pass just those
// (BackfillStatusProvider passes the eight loadBackfillStatus needs).
// There are no fallbacks: calling a function whose dependency is missing
// throws, as before conversion.
//  - loadBackfillLogTail: fetch, getSupportsBackfillLogPolling,
//    setSupportsBackfillLogPolling, setBackfillLogMessage,
//    formatBackfillLogMessage, autoScrollBackfillLogToBottom,
//    backfillLogTailLines
//  - loadBackfillStatus: fetch, updateBackfillStatusFromPayload, plus
//    loadBackfillLogTail's when includeLog is set
//  - handleBackfillAction: all of them
export interface PrBackfillActionDeps {
  fetch?: (input: string) => Promise<Response>;
  postJson?: (url: string, payload: unknown) => Promise<PostJsonResult<BackfillActionResult>>;
  beginRequestActivity?: (kind: string) => () => void;
  setStatusMessage?: (message: string) => void;
  setOutputMessage?: (message: string) => void;
  setBackfillButtonState?: (state: BackfillButtonState) => void;
  notifyFailureSnackbar?: (title: string, errorSource: unknown, fallbackMessage?: string) => void;
  formatCommandOutput?: (result: CommandResult, options?: CommandOutputOptions) => string;
  stripAnsi?: (text: unknown) => string;
  updateBackfillStatusFromPayload?: (payload: BackfillStatus, options?: { announce?: boolean }) => void;
  setBackfillLogMessage?: (message: string) => void;
  autoScrollBackfillLogToBottom?: () => void;
  formatBackfillLogMessage?: (log: { summary?: string; tail?: string }) => string;
  getSupportsBackfillLogPolling?: () => boolean;
  setSupportsBackfillLogPolling?: (supported: boolean) => void;
  getIsBackfillRunning?: () => boolean;
  setIsBackfillActionPending?: (pending: boolean) => void;
  backfillLogTailLines?: number;
}

const createPrBackfillActionHelpers = (deps: PrBackfillActionDeps) => {
  const {
    fetch,
    postJson,
    beginRequestActivity,
    setStatusMessage,
    setOutputMessage,
    setBackfillButtonState,
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
  } = deps as Required<PrBackfillActionDeps>;

  const loadBackfillLogTail = async (): Promise<BackfillLogResult> => {
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

    const result: BackfillLogResult = await response.json();

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

  // Throws on failure with the server's result attached as `error.result`.
  const loadBackfillStatus = async ({
    announce = false,
    includeLog = false,
  }: { announce?: boolean; includeLog?: boolean } = {}): Promise<BackfillStatus> => {
    const response = await fetch("/view-prs/backfill");
    const result: BackfillStatus = await response.json();

    if (!response.ok || result.ok === false) {
      const error: Error & { result?: BackfillStatus } = new Error(
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

  const handleBackfillAction = async (action: "start" | "stop"): Promise<void> => {
    const actionLabel = action === "start" ? "Starting" : "Stopping";
    const finishActivity = beginRequestActivity("backfill");
    setIsBackfillActionPending(true);
    // Disable all 4 immediately, synchronously - the first status push
    // below (updateBackfillStatusFromPayload, after the POST resolves)
    // would otherwise leave a short window where a second click could
    // fire before the UI reflects the in-flight action.
    setBackfillButtonState({
      startDisabled: true,
      stopDisabled: true,
      refreshDisabled: true,
      refreshLogDisabled: true,
    });
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
        // The reload above normally pushes a fresh button state (through
        // updateBackfillStatusFromPayload) that re-enables whatever this
        // action disabled. If the reload itself fails there's no fresh
        // state to push, so re-enable every button directly instead of
        // leaving the UI stuck.
        setBackfillButtonState({
          startDisabled: false,
          stopDisabled: false,
          refreshDisabled: false,
          refreshLogDisabled: false,
        });
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

export { createPrBackfillActionHelpers };
