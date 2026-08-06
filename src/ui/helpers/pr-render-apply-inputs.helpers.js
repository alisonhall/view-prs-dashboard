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
      sectionsHost,
      meta,
      appliedSummaryText,
      filterChips,
      grouped,
      prSectionOpenState,
      lastSuccessfulRenderedCheckAt,
      selectedScope,
      repoFilter,
      latestSelectedRepo,
      insightsViewState,
      latestSchedulerState,
    } = {}) => ({
      payload: payload && typeof payload === "object" ? payload : null,
      allStoredRows: Array.isArray(allStoredRows) ? allStoredRows : [],
      sectionsHost: sectionsHost || null,
      meta: meta && typeof meta === "object" ? meta : null,
      appliedSummaryText:
        typeof appliedSummaryText === "string" ? appliedSummaryText : "",
      filterChips: Array.isArray(filterChips) ? filterChips : [],
      grouped: grouped && typeof grouped === "object" ? grouped : {},
      prSectionOpenState:
        prSectionOpenState && typeof prSectionOpenState === "object"
          ? prSectionOpenState
          : {},
      lastSuccessfulRenderedCheckAt:
        typeof lastSuccessfulRenderedCheckAt === "string"
          ? lastSuccessfulRenderedCheckAt
          : "",
      selectedScope: typeof selectedScope === "string" ? selectedScope : "all",
      repoFilter: typeof repoFilter === "string" ? repoFilter : "",
      latestSelectedRepo:
        typeof latestSelectedRepo === "string" ? latestSelectedRepo : "",
      insightsViewState:
        insightsViewState && typeof insightsViewState === "object"
          ? insightsViewState
          : {},
      latestSchedulerState:
        latestSchedulerState && typeof latestSchedulerState === "object"
          ? latestSchedulerState
          : {},
    });

    return {
      deriveRenderApplyInputs,
    };
  };

  return {
    createPrRenderApplyInputsHelpers,
  };
});
