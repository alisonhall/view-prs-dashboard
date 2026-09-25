// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsRenderSummaryInputsHelpers fallback.
export const { createPrRenderSummaryInputsHelpers } = (() => {
  const createPrRenderSummaryInputsHelpers = () => {
    const deriveRenderSummaryInputs = ({
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
    } = {}) => ({
      rows: Array.isArray(rows) ? rows : [],
      payload: payload && typeof payload === "object" ? payload : null,
      repoFilter: typeof repoFilter === "string" ? repoFilter : "",
      scopeLabel: typeof scopeLabel === "string" ? scopeLabel : "",
      filterPrNumbersRaw:
        typeof filterPrNumbersRaw === "string" ? filterPrNumbersRaw : "",
      includeLabelFilter:
        typeof includeLabelFilter === "string" ? includeLabelFilter : "",
      excludeLabelFilter:
        typeof excludeLabelFilter === "string" ? excludeLabelFilter : "",
      authorFilter: typeof authorFilter === "string" ? authorFilter : "",
      assignedFilter: typeof assignedFilter === "string" ? assignedFilter : "",
      approverFilter: typeof approverFilter === "string" ? approverFilter : "",
      alwaysShowInReview: Boolean(alwaysShowInReview),
      openModeFilter: openModeFilter || "none",
    });

    return {
      deriveRenderSummaryInputs,
    };
  };

  return {
    createPrRenderSummaryInputsHelpers,
  };
})();
