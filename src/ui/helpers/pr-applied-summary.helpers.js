// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsAppliedSummaryHelpers fallback.
export const { createPrAppliedSummaryHelpers } = (() => {
  const createPrAppliedSummaryHelpers = () => {
    const buildAppliedSummaryViewModel = ({
      repoFilter,
      scopeLabel,
      filterPrNumbersRaw,
      includeLabelFilter,
      excludeLabelFilter,
      authorFilter,
      assignedFilter,
      approverFilter,
      alwaysShowInReview,
      openModeFilter,
      rowsCount,
      lastRunUpdatedAt,
      scheduler,
    } = {}) => {
      const appliedFilters = [
        `repo=${repoFilter || "all repos"}`,
        `scope=${scopeLabel || "all stored rows"}`,
      ];

      if (filterPrNumbersRaw) {
        appliedFilters.push(`pr-numbers=${filterPrNumbersRaw}`);
      }
      if (includeLabelFilter) {
        appliedFilters.push(`label=${includeLabelFilter}`);
      }
      if (excludeLabelFilter) {
        appliedFilters.push(`exclude-label=${excludeLabelFilter}`);
      }
      if (authorFilter) {
        appliedFilters.push(`author=${authorFilter}`);
      }
      if (assignedFilter) {
        appliedFilters.push(`assigned=${assignedFilter}`);
      }
      if (approverFilter) {
        appliedFilters.push(`approver=${approverFilter}`);
      }
      if (alwaysShowInReview) {
        appliedFilters.push("always-show-in-review=on");
      }
      if (openModeFilter && openModeFilter !== "none") {
        appliedFilters.push(`open=${openModeFilter}`);
      }

      const schedulerSafe = scheduler || {};
      const schedulerSummary = [
        `Auto every ${schedulerSafe.intervalMinutes || 15}m`,
        `Manual cooldown ${schedulerSafe.manualCooldownMinutes || 15}m`,
        `Last manual: ${schedulerSafe.lastManualRunAt || "-"}`,
        `Last auto: ${schedulerSafe.lastAutoRunAt || "-"}`,
        schedulerSafe.lastAutoSkipReason
          ? `Last auto skip: ${schedulerSafe.lastAutoSkipReason}`
          : "",
        schedulerSafe.lastAutoError
          ? `Last auto error: ${schedulerSafe.lastAutoError}`
          : "",
      ]
        .filter(Boolean)
        .join(" | ");

      const safeRowsCount = Number.isFinite(Number(rowsCount))
        ? Number(rowsCount)
        : 0;
      const safeLastRunUpdatedAt = lastRunUpdatedAt || "-";

      const appliedSummaryText = `Applied filters: ${appliedFilters.join(" | ")} | Rows: ${safeRowsCount} | Last run: ${safeLastRunUpdatedAt} | ${schedulerSummary}`;

      const filterChips = [
        ...appliedFilters,
        `rows=${safeRowsCount}`,
        `last-run=${safeLastRunUpdatedAt}`,
      ];

      return {
        appliedFilters,
        schedulerSummary,
        appliedSummaryText,
        filterChips,
      };
    };

    return {
      buildAppliedSummaryViewModel,
    };
  };

  return {
    createPrAppliedSummaryHelpers,
  };
})();
