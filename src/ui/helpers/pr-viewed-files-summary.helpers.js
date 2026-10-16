// Phase 7 (see REACT_MIGRATION_PLAN.md): pure extraction of index.page.js's
// former getViewedFilesSummary body into a DI-factory module, so
// PrInsightsRow.jsx can import it directly instead of reading
// window.getViewedFilesSummary. Byte-for-byte-logic-preserving move.
export const { createPrViewedFilesSummaryHelpers } = (() => {
  const createPrViewedFilesSummaryHelpers = ({ toCount } = {}) => {
    const toCountSafe =
      typeof toCount === "function"
        ? toCount
        : (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
          };

    const getViewedFilesSummary = (row) =>
      String(
        row?.viewedFilesSummary ||
          `${toCountSafe(row?.viewedFilesCount)}/${toCountSafe(row?.changedFilesCount)} viewed`,
      );

    return {
      getViewedFilesSummary,
    };
  };

  return {
    createPrViewedFilesSummaryHelpers,
  };
})();
