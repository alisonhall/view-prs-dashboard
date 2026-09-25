// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsRenderFinalizeHelpers fallback.
export const { createPrRenderFinalizeHelpers } = (() => {
  const createPrRenderFinalizeHelpers = ({
    deriveRenderApplyInputs,
    applyRenderResults,
    deriveCommittedRenderState,
  } = {}) => {
    const deriveRenderApplyInputsSafe =
      typeof deriveRenderApplyInputs === "function"
        ? deriveRenderApplyInputs
        : (inputs = {}) => inputs;
    const applyRenderResultsSafe =
      typeof applyRenderResults === "function"
        ? applyRenderResults
        : () => ({});
    const deriveCommittedRenderStateSafe =
      typeof deriveCommittedRenderState === "function"
        ? deriveCommittedRenderState
        : () => ({
            pendingAutoRenderPayload: null,
            lastRenderedPrFingerprint: "",
            latestPrManifest: {},
          });

    const deriveRenderFinalizedState = ({
      payload,
      allStoredRows,
      filteredRows,
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
      latestSchedulerState,
      skipTableRender,
    } = {}) => {
      const renderApplyInputs = deriveRenderApplyInputsSafe({
        payload,
        allStoredRows,
        filteredRows,
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
        latestSchedulerState,
        skipTableRender,
      });
      const nextRenderState = applyRenderResultsSafe(renderApplyInputs);

      return deriveCommittedRenderStateSafe({ nextRenderState });
    };

    return {
      deriveRenderFinalizedState,
    };
  };

  return {
    createPrRenderFinalizeHelpers,
  };
})();
