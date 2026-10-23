import type { PostJsonResult } from "./pr-http.helpers.ts";

// The "Request more" merged-PRs action (MergedRequestMoreAction): asks the
// server for 30 more merged PRs, applies the fresh data (or reloads it),
// and reports progress through status text and the failure snackbar.
interface RequestMoreResult {
  ok?: boolean;
  error?: string;
  prData?: unknown;
  refreshedPrs?: unknown[];
}

export interface PrMergedRequestMoreActionDeps {
  getIsRequestMoreMergedPending?: () => boolean;
  setIsRequestMoreMergedPending?: (pending: boolean) => void;
  getLatestSelectedRepo?: () => string;
  defaultRepo?: string;
  beginRequestActivity?: (kind: string) => () => void;
  postJson?: (url: string, payload: unknown) => Promise<PostJsonResult<RequestMoreResult>>;
  applyFreshPrPayload?: (prData: unknown, repo: string) => void;
  loadStoredData?: (repo: string, options: { useLastRunScope: boolean }) => Promise<unknown>;
  setStatusMessage?: (message: string) => void;
  notifyFailureSnackbar?: (title: string, errorSource: unknown, fallbackMessage?: string) => void;
}

export interface RequestMoreCallbacks {
  onPendingChange?: (pending: boolean) => void;
  onStatusChange?: (status: string) => void;
}

const createPrMergedRequestMoreActionHelpers = ({
  getIsRequestMoreMergedPending,
  setIsRequestMoreMergedPending,
  getLatestSelectedRepo,
  defaultRepo,
  beginRequestActivity,
  postJson,
  applyFreshPrPayload,
  loadStoredData,
  setStatusMessage,
  notifyFailureSnackbar,
}: PrMergedRequestMoreActionDeps = {}) => {
  const getIsRequestMoreMergedPendingSafe =
    typeof getIsRequestMoreMergedPending === "function"
      ? getIsRequestMoreMergedPending
      : () => false;
  const setIsRequestMoreMergedPendingSafe =
    typeof setIsRequestMoreMergedPending === "function"
      ? setIsRequestMoreMergedPending
      : () => {};
  const getLatestSelectedRepoSafe =
    typeof getLatestSelectedRepo === "function"
      ? getLatestSelectedRepo
      : () => "";
  const defaultRepoSafe = typeof defaultRepo === "string" ? defaultRepo : "";
  const beginRequestActivitySafe =
    typeof beginRequestActivity === "function"
      ? beginRequestActivity
      : () => () => {};
  // Without postJson, behave like a failed request (a plain object stands
  // in for the Response, as before conversion).
  const postJsonSafe =
    typeof postJson === "function"
      ? postJson
      : async (): Promise<PostJsonResult<RequestMoreResult>> => ({
          response: { ok: false } as Response,
          result: { ok: false, error: "postJson is not available" },
        });
  const applyFreshPrPayloadSafe =
    typeof applyFreshPrPayload === "function" ? applyFreshPrPayload : () => {};
  const loadStoredDataSafe =
    typeof loadStoredData === "function" ? loadStoredData : async () => {};
  const setStatusMessageSafe =
    typeof setStatusMessage === "function" ? setStatusMessage : () => {};
  const notifyFailureSnackbarSafe =
    typeof notifyFailureSnackbar === "function"
      ? notifyFailureSnackbar
      : () => {};

  // onPendingChange/onStatusChange are per-call options: the caller is a
  // specific MergedRequestMoreAction instance passing its own state
  // setters.
  const handleRequestMoreMerged = async (
    repoOverride: string = "",
    { onPendingChange, onStatusChange }: RequestMoreCallbacks = {},
  ): Promise<void> => {
    if (getIsRequestMoreMergedPendingSafe()) {
      return;
    }

    const onPendingChangeSafe =
      typeof onPendingChange === "function" ? onPendingChange : () => {};
    const onStatusChangeSafe =
      typeof onStatusChange === "function" ? onStatusChange : () => {};

    const repo =
      String(repoOverride || getLatestSelectedRepoSafe() || "").trim() ||
      defaultRepoSafe;

    setIsRequestMoreMergedPendingSafe(true);
    onPendingChangeSafe(true);
    onStatusChangeSafe("Requesting 30 more merged PRs...");
    setStatusMessageSafe("Requesting more merged PRs...");

    const finishActivity = beginRequestActivitySafe("dataLoad");
    try {
      const { response, result } = await postJsonSafe(
        "/view-prs/merged/request-more",
        {
          repo,
          count: 30,
          scanLimit: 100,
        },
      );

      if (!response.ok || result?.ok === false) {
        throw new Error(result?.error || "Failed to request more merged PRs");
      }

      if (result?.prData) {
        applyFreshPrPayloadSafe(result.prData, repo);
      } else {
        await loadStoredDataSafe(repo, { useLastRunScope: false });
      }

      const refreshedCount = Array.isArray(result?.refreshedPrs)
        ? result.refreshedPrs.length
        : 0;
      const refreshedText =
        refreshedCount > 0
          ? `Loaded ${refreshedCount} merged PR${refreshedCount === 1 ? "" : "s"}.`
          : "No missing merged PRs found in the scanned range.";

      onStatusChangeSafe(refreshedText);
      setStatusMessageSafe(refreshedText);
    } catch (error) {
      const message = String((error as { message?: unknown })?.message || error || "Request failed");
      onStatusChangeSafe(message);
      setStatusMessageSafe("Failed to request more merged PRs");
      notifyFailureSnackbarSafe(
        "Request more failed",
        error,
        "Unable to fetch more merged PRs",
      );
    } finally {
      setIsRequestMoreMergedPendingSafe(false);
      onPendingChangeSafe(false);
      finishActivity();
    }
  };

  return {
    handleRequestMoreMerged,
  };
};

export { createPrMergedRequestMoreActionHelpers };
