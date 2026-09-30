// "Quick check all existing PRs" (see the saved plan / REACT_MIGRATION_PLAN.md
// context): checks every PR number already loaded in the app, grouped by its
// own repo, rather than requiring the user to type numbers into the Run &
// Filter tab. The loaded table isn't scoped to one repo - PrTableApp.jsx
// deliberately renders rows from every repo ever loaded together (see its own
// comment) - so this collects PR numbers per distinct repo present in the
// loaded payload and sends them all in one request to POST
// /view-prs/quick-check-all (one lock acquisition server-side for the whole
// sweep, rather than firing one /quick-check request per repo from here,
// which would just race against the server's single isQuickCheckInProgress
// flag).
//
// buildQuickCheckOutcome is the 409/503/failure/success branching extracted
// verbatim from index.page.js's original handleQuickCheck body (pure
// extraction, zero behavior change - same discipline as this session's
// earlier sub-phase 7.2/7.3 work) so both the single "Quick check" button and
// this new "Quick check all" button share one implementation instead of
// duplicating it. Only the idle/fallback label and the success label's exact
// wording differ between the two callers, so both are passed in rather than
// hardcoded here.
export const { createPrQuickCheckActionsHelpers } = (() => {
  const collectAllLoadedPrsByRepo = (byPrNumber) => {
    const map = new Map();
    Object.values(byPrNumber || {}).forEach((entry) => {
      const repo = entry?.repo;
      const number = entry?.data?.number ?? entry?.prNumber;
      if (!repo || (number === undefined || number === null || number === "")) {
        return;
      }
      if (!map.has(repo)) {
        map.set(repo, []);
      }
      map.get(repo).push(String(number));
    });
    return map;
  };

  const toRepoRequests = (map) =>
    Array.from(map.entries()).map(([repo, prNumbers]) => ({
      repo,
      prNumbers: prNumbers.join(","),
    }));

  const createPrQuickCheckActionsHelpers = ({
    showErrorNotification,
    showWarningNotification,
    notifyFailureSnackbar,
    loadSchedulerStatus,
  } = {}) => {
    const showErrorNotificationSafe =
      typeof showErrorNotification === "function" ? showErrorNotification : () => {};
    const showWarningNotificationSafe =
      typeof showWarningNotification === "function" ? showWarningNotification : () => {};
    const notifyFailureSnackbarSafe =
      typeof notifyFailureSnackbar === "function" ? notifyFailureSnackbar : () => {};
    const loadSchedulerStatusSafe =
      typeof loadSchedulerStatus === "function" ? loadSchedulerStatus : () => {};

    const buildQuickCheckOutcome = ({ response, result, fallbackLabel, buildSuccessLabel }) => {
      if (response.status === 409) {
        showErrorNotificationSafe(
          "Quick check already in progress",
          result?.error ||
            "A quick check or auto refresh is already running. Try again shortly.",
          6000,
        );
        return { label: fallbackLabel };
      }
      if (response.status === 503) {
        showWarningNotificationSafe(
          "Quick check unavailable",
          result?.error ||
            "Auto refresh circuit breaker is open after repeated failures. Try again later.",
          8000,
        );
        return { label: fallbackLabel };
      }
      if (!response.ok || result.ok === false) {
        notifyFailureSnackbarSafe(
          "Quick check failed",
          result,
          result?.error || "Unexpected error running quick check",
        );
        return { label: fallbackLabel };
      }

      // Counts reflect only what THIS run found (server-side
      // newPendingOpenCount/newPendingMergedClosedCount), not the
      // scheduler's accumulated backlog - showing the latter here would
      // misrepresent stale, already-known pending state as something this
      // click just discovered.
      const pendingTotal =
        (result.newPendingOpenCount || 0) + (result.newPendingMergedClosedCount || 0);
      const reposChecked = Array.isArray(result.reposChecked) ? result.reposChecked : [];
      const failedCount = Array.isArray(result.reposFailed) ? result.reposFailed.length : 0;

      // A repo failing to check (e.g. expired gh auth) still returns ok:true
      // when other repos succeeded - surface it anyway so a "no changes"
      // label is never confused with "the check for this repo didn't
      // actually run".
      if (failedCount > 0) {
        showWarningNotificationSafe(
          "Quick check incomplete",
          result?.error ||
            `Quick check failed for ${failedCount} repo(s). See server logs for details.`,
          10000,
        );
      }

      // Reflects the fresh pending counts in the Auto Refresh panel right
      // away instead of waiting for its own independent poll interval.
      void loadSchedulerStatusSafe();

      return {
        label:
          typeof buildSuccessLabel === "function"
            ? buildSuccessLabel({ pendingTotal, reposChecked, failedCount })
            : fallbackLabel,
        resetAfterMs: 2500,
      };
    };

    return {
      collectAllLoadedPrsByRepo,
      toRepoRequests,
      buildQuickCheckOutcome,
    };
  };

  return {
    createPrQuickCheckActionsHelpers,
  };
})();
