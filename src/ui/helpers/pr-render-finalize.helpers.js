(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRenderFinalizeHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
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
    } = {}) => {
      const renderApplyInputs = deriveRenderApplyInputsSafe({
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
});
