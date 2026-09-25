// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsRenderSummaryHelpers fallback.
export const { createPrRenderSummaryHelpers } = (() => {
  const createPrRenderSummaryHelpers = ({
    buildGroupedPrSections,
    buildAppliedSummaryViewModel,
    renderSchedulerStatus,
  } = {}) => {
    const buildGroupedPrSectionsSafe =
      typeof buildGroupedPrSections === "function"
        ? buildGroupedPrSections
        : () => ({ opened: [], inReview: [], merged: [], closed: [] });
    const buildAppliedSummaryViewModelSafe =
      typeof buildAppliedSummaryViewModel === "function"
        ? buildAppliedSummaryViewModel
        : () => ({ appliedSummaryText: "", filterChips: [] });
    const renderSchedulerStatusSafe =
      typeof renderSchedulerStatus === "function"
        ? renderSchedulerStatus
        : () => {};

    const deriveRenderSummary = ({
      rows,
      payload,
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
    } = {}) => {
      const grouped = buildGroupedPrSectionsSafe(rows);
      const scheduler = payload?.scheduler || {};
      renderSchedulerStatusSafe(scheduler);

      const { appliedSummaryText, filterChips } =
        buildAppliedSummaryViewModelSafe({
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
          rowsCount: Array.isArray(rows) ? rows.length : 0,
          lastRunUpdatedAt: payload?.lastRun?.updatedAt || "-",
          scheduler,
        });

      return {
        grouped,
        scheduler,
        appliedSummaryText,
        filterChips,
      };
    };

    return {
      deriveRenderSummary,
    };
  };

  return {
    createPrRenderSummaryHelpers,
  };
})();
