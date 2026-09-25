// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsInsightBadgeClassHelpers fallback.
export const { createPrInsightBadgeClassHelpers } = (() => {
  const createPrInsightBadgeClassHelpers = ({
    isChangedStatus,
  } = {}) => {
    const isChangedStatusSafe =
      typeof isChangedStatus === "function" ? isChangedStatus : () => false;

    const getBadgeClassForStatus = (status) => {
      if (isChangedStatusSafe(status)) return "insight-badge-status-changed";
      if (status === "NO_CHANGE") return "insight-badge-status-no-change";
      if (status === "NO_ACTIVITY") return "insight-badge-status-no-activity";
      return "";
    };

    const getBadgeClassForCheck = (state) => {
      if (state === "PASS") return "insight-badge-check-pass";
      if (state === "FAIL") return "insight-badge-check-fail";
      if (state === "RUN") return "insight-badge-check-run";
      if (state === "SKIP") return "insight-badge-check-skip";
      return "insight-badge-check-na";
    };

    const getBadgeClassForMerge = (state) => {
      if (state === "YES") return "insight-badge-merge-yes";
      if (state === "NO") return "insight-badge-merge-no";
      return "insight-badge-merge-unk";
    };

    return {
      getBadgeClassForStatus,
      getBadgeClassForCheck,
      getBadgeClassForMerge,
    };
  };

  return {
    createPrInsightBadgeClassHelpers,
  };
})();
