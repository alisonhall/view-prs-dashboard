// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsRunPrDataContextHelpers fallback.
export const { createPrRunPrDataContextHelpers } = (() => {
  const createPrRunPrDataContextHelpers = ({
    captureRenderContext,
    deriveRepoRunContext,
    deriveScopeSettings,
    getNeedsAttentionConfig,
    deriveRowSources,
    // Phase 6 (see REACT_MIGRATION_PLAN.md): "scope-mode" is one of the two
    // Slice 1 fields migrated onto FilterStateProvider's Context. Optional -
    // returns undefined by default, so deriveScopeSettings falls back to
    // reading renderContext.scopeSelect?.value (the original DOM read)
    // exactly as before when this isn't provided (e.g. existing unit tests
    // that don't pass it) or when it returns undefined (React hasn't
    // mounted the provider yet).
    getFilterStateValue,
  } = {}) => {
    const getFilterStateValueSafe =
      typeof getFilterStateValue === "function" ? getFilterStateValue : () => undefined;
    const captureRenderContextSafe =
      typeof captureRenderContext === "function"
        ? captureRenderContext
        : () => ({
            sectionsHost: null,
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
      const filterStateScopeMode = getFilterStateValueSafe("scopeMode");
      const scopeSettings = deriveScopeSettingsSafe({
        filterPrNumbersRaw,
        scopeModeValue:
          typeof filterStateScopeMode === "string"
            ? filterStateScopeMode
            : renderContext.scopeSelect?.value,
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
})();
