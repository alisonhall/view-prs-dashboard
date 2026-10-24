// Loads /view-prs/scheduler and hands the scheduler object to a renderer
// (useQuickCheckActions builds its own instance). A 404 means the server
// has no scheduler, which isn't an error.
export interface SchedulerStatusResult {
  ok?: boolean;
  scheduler?: Record<string, unknown> | null;
  error?: string;
}

export interface PrSchedulerStatusDeps {
  fetch?: (input: string) => Promise<Response>;
  renderSchedulerStatus?: (scheduler: Record<string, unknown>) => void;
}

const createPrSchedulerStatusHelpers = ({ fetch, renderSchedulerStatus }: PrSchedulerStatusDeps = {}) => {
  const fetchSafe =
    typeof fetch === "function"
      ? fetch
      : (): Promise<Response> => Promise.reject(new Error("fetch is not available"));
  const renderSchedulerStatusSafe =
    typeof renderSchedulerStatus === "function" ? renderSchedulerStatus : () => {};

  const loadSchedulerStatus = async (): Promise<SchedulerStatusResult> => {
    const response = await fetchSafe("/view-prs/scheduler");
    if (response.status === 404) {
      return { ok: false, scheduler: null };
    }

    const result: SchedulerStatusResult = await response.json();
    if (!response.ok || result.ok === false) {
      throw new Error(result.error || "Failed to fetch scheduler status");
    }

    renderSchedulerStatusSafe(result.scheduler || {});
    return result;
  };

  return {
    loadSchedulerStatus,
  };
};

export { createPrSchedulerStatusHelpers };
