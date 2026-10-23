import type { PrDataPayload } from "../types/pr-data.ts";

// PrDataProvider's full data load: GET /view-prs/data, then hand the
// payload and its version/run stamps to the injected setters and renderer,
// tracked as a "dataLoad" request activity.
export interface PrStoredDataLoadDeps {
  fetch?: (input: string) => Promise<Response>;
  beginRequestActivity?: (kind: string) => () => void;
  setLastSeenDataVersion?: (dataVersion: string) => void;
  setLastRenderedRunStamp?: (runStamp: string) => void;
  setLastSuccessfulRenderedCheckAt?: (checkedAt: string) => void;
  setLatestStoredPayload?: (payload: PrDataPayload) => void;
  getLatestSelectedRepo?: () => string;
  setLatestSelectedRepo?: (repo: string) => void;
  updateBackfillStatusFromPayload?: (payload: PrDataPayload) => void;
  renderPrData?: (payload: PrDataPayload, selectedRepo: string, options: Record<string, unknown>) => void;
}

const createPrStoredDataLoadHelpers = ({
  fetch,
  beginRequestActivity,
  setLastSeenDataVersion,
  setLastRenderedRunStamp,
  setLastSuccessfulRenderedCheckAt,
  setLatestStoredPayload,
  getLatestSelectedRepo,
  setLatestSelectedRepo,
  updateBackfillStatusFromPayload,
  renderPrData,
}: PrStoredDataLoadDeps = {}) => {
  const fetchSafe =
    typeof fetch === "function"
      ? fetch
      : (): Promise<Response> => Promise.reject(new Error("fetch is not available"));
  const beginRequestActivitySafe =
    typeof beginRequestActivity === "function"
      ? beginRequestActivity
      : () => () => {};
  const setLastSeenDataVersionSafe =
    typeof setLastSeenDataVersion === "function" ? setLastSeenDataVersion : () => {};
  const setLastRenderedRunStampSafe =
    typeof setLastRenderedRunStamp === "function" ? setLastRenderedRunStamp : () => {};
  const setLastSuccessfulRenderedCheckAtSafe =
    typeof setLastSuccessfulRenderedCheckAt === "function"
      ? setLastSuccessfulRenderedCheckAt
      : () => {};
  const setLatestStoredPayloadSafe =
    typeof setLatestStoredPayload === "function" ? setLatestStoredPayload : () => {};
  const getLatestSelectedRepoSafe =
    typeof getLatestSelectedRepo === "function" ? getLatestSelectedRepo : () => "";
  const setLatestSelectedRepoSafe =
    typeof setLatestSelectedRepo === "function" ? setLatestSelectedRepo : () => {};
  const updateBackfillStatusFromPayloadSafe =
    typeof updateBackfillStatusFromPayload === "function"
      ? updateBackfillStatusFromPayload
      : () => {};
  const renderPrDataSafe = typeof renderPrData === "function" ? renderPrData : () => {};

  const loadStoredData = async (
    selectedRepo: string = "",
    options: Record<string, unknown> = {},
  ): Promise<PrDataPayload> => {
    const finishActivity = beginRequestActivitySafe("dataLoad");
    try {
      const response = await fetchSafe("/view-prs/data");
      const result: PrDataPayload = await response.json();
      if (!response.ok || result.ok === false) {
        throw new Error(result.error || "Failed to fetch stored PR data");
      }

      const dataVersion = String(result?.dataMeta?.dataVersion || "").trim();
      if (dataVersion) {
        setLastSeenDataVersionSafe(dataVersion);
      }

      const updatedAt = String(result?.lastRun?.updatedAt || "").trim();
      if (updatedAt) {
        setLastRenderedRunStampSafe(result.lastRun?.updatedAt ?? "");
        setLastSuccessfulRenderedCheckAtSafe(updatedAt);
      }

      setLatestStoredPayloadSafe(result);
      setLatestSelectedRepoSafe(selectedRepo || getLatestSelectedRepoSafe() || "");
      updateBackfillStatusFromPayloadSafe(result);
      renderPrDataSafe(result, selectedRepo, options);
      return result;
    } finally {
      finishActivity();
    }
  };

  return {
    loadStoredData,
  };
};

export { createPrStoredDataLoadHelpers };
