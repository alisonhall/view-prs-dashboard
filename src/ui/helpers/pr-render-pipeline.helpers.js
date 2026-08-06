(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRenderPipelineHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrRenderPipelineHelpers = ({
    deriveViewerFilterSetup,
    deriveRenderFilterSummaryState,
    deriveRenderFinalizedState,
  } = {}) => {
    const deriveViewerFilterSetupSafe =
      typeof deriveViewerFilterSetup === "function"
        ? deriveViewerFilterSetup
        : () => ({ currentActorLoginAliases: {}, currentViewerLogin: "" });
    const deriveRenderFilterSummaryStateSafe =
      typeof deriveRenderFilterSummaryState === "function"
        ? deriveRenderFilterSummaryState
        : () => ({ grouped: {}, appliedSummaryText: "", filterChips: [] });
    const deriveRenderFinalizedStateSafe =
      typeof deriveRenderFinalizedState === "function"
        ? deriveRenderFinalizedState
        : () => ({
            pendingAutoRenderPayload: null,
            lastRenderedPrFingerprint: "",
            latestPrManifest: {},
          });

    const deriveRenderPipelineState = ({
      payload,
      allEntries,
      repoFilter,
      normalizedRunStamp,
      rowsForRepo,
      ignoreScopeForPrNumberFilter,
      runStamp,
      useLastRunScope,
      selectedScope,
      attentionConfig,
      filterPrNumbers,
      filterPrNumbersRaw,
      allStoredRows,
      sectionsHost,
      meta,
      prSectionOpenState,
      lastSuccessfulRenderedCheckAt,
      latestSelectedRepo,
      insightsViewState,
      latestSchedulerState,
    } = {}) => {
      const nextLastSuccessfulRenderedCheckAt =
        typeof normalizedRunStamp === "string" && normalizedRunStamp
          ? normalizedRunStamp
          : typeof lastSuccessfulRenderedCheckAt === "string"
            ? lastSuccessfulRenderedCheckAt
            : "";

      deriveViewerFilterSetupSafe({
        payload,
        allEntries,
        repoFilter,
      });

      const { grouped, appliedSummaryText, filterChips } =
        deriveRenderFilterSummaryStateSafe({
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
        });

      const committedRenderState = deriveRenderFinalizedStateSafe({
        payload,
        allStoredRows,
        sectionsHost,
        meta,
        appliedSummaryText,
        filterChips,
        grouped,
        prSectionOpenState,
        lastSuccessfulRenderedCheckAt: nextLastSuccessfulRenderedCheckAt,
        selectedScope,
        repoFilter,
        latestSelectedRepo,
        insightsViewState,
        latestSchedulerState,
      });

      return {
        lastSuccessfulRenderedCheckAt: nextLastSuccessfulRenderedCheckAt,
        committedRenderState,
      };
    };

    return {
      deriveRenderPipelineState,
    };
  };

  return {
    createPrRenderPipelineHelpers,
  };
});
