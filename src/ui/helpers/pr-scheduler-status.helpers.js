// Phase H.24 (see REACT_MIGRATION_PLAN.md, "Remaining-effort audit",
// cluster 1): extracted out of index.page.js's own closure-based
// loadSchedulerStatus so useQuickCheckActions.jsx can build its own
// instance directly, instead of reading window.loadSchedulerStatus - same
// "every live consumer builds its own separate instance of the same pure
// factory" pattern every other Context in this migration already uses.
// Drops the old 404 branch's supportsSchedulerPolling write entirely -
// confirmed via grep to have had zero remaining reader anywhere (its own
// window.getSupportsSchedulerPolling bridge was deleted the same phase).
const createPrSchedulerStatusHelpers = ({ fetch, renderSchedulerStatus } = {}) => {
  const fetchSafe =
    typeof fetch === "function" ? fetch : () => Promise.reject(new Error("fetch is not available"));
  const renderSchedulerStatusSafe =
    typeof renderSchedulerStatus === "function" ? renderSchedulerStatus : () => {};

  const loadSchedulerStatus = async () => {
    const response = await fetchSafe("/view-prs/scheduler");
    if (response.status === 404) {
      return { ok: false, scheduler: null };
    }

    const result = await response.json();
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
