(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRenderApplyInputsHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
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
});
