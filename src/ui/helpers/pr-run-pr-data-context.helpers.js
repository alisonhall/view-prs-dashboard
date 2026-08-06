(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsRunPrDataContextHelpers = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const createPrRunPrDataContextHelpers = ({
    captureRenderContext,
    deriveRepoRunContext,
    deriveScopeSettings,
    getNeedsAttentionConfig,
    deriveRowSources,
  } = {}) => {
    const captureRenderContextSafe =
      typeof captureRenderContext === "function"
        ? captureRenderContext
        : () => ({
            sectionsHost: null,
            insightsViewState: { expanded: new Set(), innerOpen: new Map() },
            prSectionOpenState: new Map(),
            meta: null,
            scopeSelect: null,
            allEntries: [],
            lastRun: null,
          });
    const deriveRepoRunContextSafe =
      typeof deriveRepoRunContext === "function"
        ? deriveRepoRunContext
        : () => ({ repoFilter: "", runStamp: "", normalizedRunStamp: "" });
    const deriveScopeSettingsSafe =
      typeof deriveScopeSettings === "function"
        ? deriveScopeSettings
        : () => ({
            filterPrNumbers: [],
            selectedScope: "all",
            ignoreScopeForPrNumberFilter: false,
            useLastRunScope: false,
          });
    const getNeedsAttentionConfigSafe =
      typeof getNeedsAttentionConfig === "function"
        ? getNeedsAttentionConfig
        : () => ({});
    const deriveRowSourcesSafe =
      typeof deriveRowSources === "function"
        ? deriveRowSources
        : ({ allEntries }) => ({
            rowsForRepo: Array.isArray(allEntries) ? allEntries : [],
            allStoredRows: Array.isArray(allEntries) ? allEntries : [],
          });

    const deriveRunPrDataContext = ({
      payload,
      selectedRepo,
      inputRepo,
      filterPrNumbersRaw,
      optionsUseLastRunScope,
    } = {}) => {
      const renderContext = captureRenderContextSafe(payload);
      const repoRunContext = deriveRepoRunContextSafe({
        selectedRepo,
        inputRepo,
        lastRun: renderContext.lastRun,
      });
      const scopeSettings = deriveScopeSettingsSafe({
        filterPrNumbersRaw,
        scopeModeValue: renderContext.scopeSelect?.value,
        optionsUseLastRunScope,
      });
      const attentionConfig = getNeedsAttentionConfigSafe();
      const rowSources = deriveRowSourcesSafe({
        allEntries: renderContext.allEntries,
        repoFilter: repoRunContext.repoFilter,
      });

      return {
        ...renderContext,
        ...repoRunContext,
        filterPrNumbersRaw:
          typeof filterPrNumbersRaw === "string" ? filterPrNumbersRaw : "",
        ...scopeSettings,
        attentionConfig,
        ...rowSources,
      };
    };

    return {
      deriveRunPrDataContext,
    };
  };

  return {
    createPrRunPrDataContextHelpers,
  };
});
