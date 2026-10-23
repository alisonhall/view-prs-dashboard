// CSS classes for the status/CHK/MRG badges in PrInsightsRow.
export interface PrInsightBadgeClassDeps {
  isChangedStatus?: (status: unknown) => boolean;
}

const createPrInsightBadgeClassHelpers = ({
  isChangedStatus,
}: PrInsightBadgeClassDeps = {}) => {
  const isChangedStatusSafe =
    typeof isChangedStatus === "function" ? isChangedStatus : () => false;

  const getBadgeClassForStatus = (status: unknown): string => {
    if (isChangedStatusSafe(status)) return "insight-badge-status-changed";
    if (status === "NO_CHANGE") return "insight-badge-status-no-change";
    if (status === "NO_ACTIVITY") return "insight-badge-status-no-activity";
    return "";
  };

  const getBadgeClassForCheck = (state: unknown): string => {
    if (state === "PASS") return "insight-badge-check-pass";
    if (state === "FAIL") return "insight-badge-check-fail";
    if (state === "RUN") return "insight-badge-check-run";
    if (state === "SKIP") return "insight-badge-check-skip";
    return "insight-badge-check-na";
  };

  const getBadgeClassForMerge = (state: unknown): string => {
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

export { createPrInsightBadgeClassHelpers };
