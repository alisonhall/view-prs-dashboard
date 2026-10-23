import type { PostJsonResult } from "./pr-http.helpers.ts";

// The "Trigger auto run" button's request (useTriggerAutoRun): POSTs
// /view-prs/run-auto and reports a conflict (409, already running) or a
// failure through the injected notifiers.
interface RunAutoResult {
  ok?: boolean;
  error?: string;
}

export interface PrTriggerAutoRunActionDeps {
  postJson?: (url: string, payload: unknown) => Promise<PostJsonResult<RunAutoResult>>;
  showErrorNotification?: (title: string, detail: string, durationMs?: number) => void;
  notifyFailureSnackbar?: (title: string, errorSource: unknown, fallbackMessage?: string) => void;
}

const createPrTriggerAutoRunActionHelpers = ({
  postJson,
  showErrorNotification,
  notifyFailureSnackbar,
}: PrTriggerAutoRunActionDeps = {}) => {
  const postJsonSafe =
    typeof postJson === "function"
      ? postJson
      : (): Promise<PostJsonResult<RunAutoResult>> => Promise.reject(new Error("postJson unavailable"));
  const showErrorNotificationSafe =
    typeof showErrorNotification === "function" ? showErrorNotification : () => {};
  const notifyFailureSnackbarSafe =
    typeof notifyFailureSnackbar === "function" ? notifyFailureSnackbar : () => {};

  const runTriggerAutoRunWorkflow = async (): Promise<void> => {
    try {
      const { response, result } = await postJsonSafe("/view-prs/run-auto", {});
      if (response.status === 409) {
        showErrorNotificationSafe(
          "Auto run already in progress",
          "An auto run is already running. It will complete shortly.",
          6000,
        );
      } else if (!response.ok || result.ok === false) {
        notifyFailureSnackbarSafe(
          "Failed to trigger auto run",
          result,
          result?.error || "Unexpected error triggering auto run",
        );
      }
    } catch (error) {
      notifyFailureSnackbarSafe(
        "Failed to trigger auto run",
        error,
        "Unable to reach the server",
      );
    }
  };

  return {
    runTriggerAutoRunWorkflow,
  };
};

export { createPrTriggerAutoRunActionHelpers };
