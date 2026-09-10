(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsReactFilterDropdownsHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  /**
   * The vanilla render path (prDataTabOrchestrator.renderPrData) runs the
   * full deriveRunPrDataContext -> deriveRenderPipelineState pipeline,
   * which populates the filter dropdowns (labels/authors/assignees/
   * approvers/thread-resolution actors/change-filter actors) as a side
   * effect of computing allEntries/repoFilter for the table it renders.
   *
   * The React render path mounts/updates the table directly and never runs
   * that pipeline, which silently dropped the dropdown-population side
   * effect along with it. This helper re-derives just the allEntries/
   * repoFilter context (reusing the same vanilla deriveRunPrDataContext/
   * deriveViewerFilterSetup helpers, so the dropdowns stay scoped to the
   * same repo the table is showing) and re-runs populateFilterOptions,
   * without pulling in the rest of the vanilla DOM-rebuilding pipeline that
   * React doesn't need.
   *
   * Call this from any React-rendering path (current or future) that
   * bypasses prDataTabOrchestrator.renderPrData.
   */
  const createPrReactFilterDropdownsHelpers = ({
    getOptionalElementById,
    deriveRunPrDataContext,
    deriveViewerFilterSetup,
  } = {}) => {
    const getOptionalElementByIdSafe =
      typeof getOptionalElementById === "function" ? getOptionalElementById : () => null;
    const deriveRunPrDataContextSafe =
      typeof deriveRunPrDataContext === "function"
        ? deriveRunPrDataContext
        : () => ({ allEntries: [], repoFilter: "" });
    const deriveViewerFilterSetupSafe =
      typeof deriveViewerFilterSetup === "function" ? deriveViewerFilterSetup : () => {};

    const populateFilterDropdownsForCurrentPayload = (payload, selectedRepo) => {
      const repoInput = getOptionalElementByIdSafe("repo");
      const filterPrNumbersInput = getOptionalElementByIdSafe("filter-pr-numbers");
      if (!repoInput || !filterPrNumbersInput) return;

      const runContext = deriveRunPrDataContextSafe({
        payload,
        selectedRepo,
        inputRepo: String(repoInput.value || "").trim(),
        filterPrNumbersRaw: String(filterPrNumbersInput.value || "").trim(),
      });

      deriveViewerFilterSetupSafe({
        payload,
        allEntries: runContext.allEntries,
        repoFilter: runContext.repoFilter,
      });
    };

    return {
      populateFilterDropdownsForCurrentPayload,
    };
  };

  return {
    createPrReactFilterDropdownsHelpers,
  };
});
