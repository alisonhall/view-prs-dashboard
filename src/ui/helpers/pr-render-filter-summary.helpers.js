(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRenderFilterSummaryHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrRenderFilterSummaryHelpers = ({
    deriveScopedRows,
    deriveFilterSelectionInputs,
    deriveFilterPipelineState,
    deriveRenderSummaryInputs,
    deriveRenderSummary,
  } = {}) => {
    const deriveScopedRowsSafe =
      typeof deriveScopedRows === "function"
        ? deriveScopedRows
        : () => ({ rows: [], scopeLabel: "" });
    const deriveFilterSelectionInputsSafe =
      typeof deriveFilterSelectionInputs === "function"
        ? deriveFilterSelectionInputs
        : () => ({
            includeLabelFilter: [],
            excludeLabelFilter: [],
            authorFilter: [],
            assignedFilter: [],
            approverFilter: [],
            openModeFilter: "none",
            alwaysShowInReview: false,
          });
    const deriveFilterPipelineStateSafe =
      typeof deriveFilterPipelineState === "function"
        ? deriveFilterPipelineState
        : ({ rows }) => ({
            rows: Array.isArray(rows) ? rows : [],
            includeLabelFilter: [],
            excludeLabelFilter: [],
            authorFilter: [],
            assignedFilter: [],
            approverFilter: [],
            openModeFilter: "none",
            alwaysShowInReview: false,
          });
    const deriveRenderSummaryInputsSafe =
      typeof deriveRenderSummaryInputs === "function"
        ? deriveRenderSummaryInputs
        : (inputs = {}) => inputs;
    const deriveRenderSummarySafe =
      typeof deriveRenderSummary === "function"
        ? deriveRenderSummary
        : () => ({
            grouped: { opened: [], inReview: [], merged: [], closed: [] },
            appliedSummaryText: "",
            filterChips: [],
          });

    const deriveRenderFilterSummaryState = ({
      rowsForRepo,
      ignoreScopeForPrNumberFilter,
      runStamp,
      useLastRunScope,
      selectedScope,
      attentionConfig,
      filterPrNumbers,
      payload,
      repoFilter,
      filterPrNumbersRaw,
    } = {}) => {
      const { rows: scopedRows, scopeLabel } = deriveScopedRowsSafe({
        rowsForRepo,
        ignoreScopeForPrNumberFilter,
        runStamp,
        useLastRunScope,
        selectedScope,
        attentionConfig,
      });

      const filterSelectionInputs = deriveFilterSelectionInputsSafe();
      const {
        includeLabelFilter,
        excludeLabelFilter,
        authorFilter,
        assignedFilter,
        approverFilter,
        openModeFilter,
        alwaysShowInReview,
        rows,
      } = deriveFilterPipelineStateSafe({
        rows: scopedRows,
        filterPrNumbers,
        ...filterSelectionInputs,
      });
      const filteredRows = Array.isArray(rows) ? rows : [];

      const renderSummaryInputs = deriveRenderSummaryInputsSafe({
        rows: filteredRows,
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
      });

      const { grouped, appliedSummaryText, filterChips } =
        deriveRenderSummarySafe(renderSummaryInputs);

      return {
        rows: filteredRows,
        grouped,
        appliedSummaryText,
        filterChips,
      };
    };

    return {
      deriveRenderFilterSummaryState,
    };
  };

  return {
    createPrRenderFilterSummaryHelpers,
  };
});
