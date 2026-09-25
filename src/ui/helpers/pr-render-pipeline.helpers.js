// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsRenderPipelineHelpers fallback.
export const { createPrRenderPipelineHelpers } = (() => {
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
      latestSchedulerState,
      skipTableRender,
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

      const { rows: filteredRows, grouped, appliedSummaryText, filterChips } =
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
        filteredRows,
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
        latestSchedulerState,
        skipTableRender,
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
})();
