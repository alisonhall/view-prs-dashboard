// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsRenderApplyInputsHelpers fallback.
export const { createPrRenderApplyInputsHelpers } = (() => {
  const createPrRenderApplyInputsHelpers = () => {
    const deriveRenderApplyInputs = ({
      payload,
      allStoredRows,
      filteredRows,
      sectionsHost,
      meta,
      appliedSummaryText,
      filterChips,
      selectedScope,
      repoFilter,
      latestSelectedRepo,
    } = {}) => ({
      payload: payload && typeof payload === "object" ? payload : null,
      allStoredRows: Array.isArray(allStoredRows) ? allStoredRows : [],
      filteredRows: Array.isArray(filteredRows) ? filteredRows : [],
      sectionsHost: sectionsHost || null,
      meta: meta && typeof meta === "object" ? meta : null,
      appliedSummaryText:
        typeof appliedSummaryText === "string" ? appliedSummaryText : "",
      filterChips: Array.isArray(filterChips) ? filterChips : [],
      selectedScope: typeof selectedScope === "string" ? selectedScope : "all",
      repoFilter: typeof repoFilter === "string" ? repoFilter : "",
      latestSelectedRepo:
        typeof latestSelectedRepo === "string" ? latestSelectedRepo : "",
    });

    return {
      deriveRenderApplyInputs,
    };
  };

  return {
    createPrRenderApplyInputsHelpers,
  };
})();
