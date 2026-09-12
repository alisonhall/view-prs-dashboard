(function (global, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    global.ViewPrsPrDataTabOrchestrator = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Creates PR Data Tab orchestrator that coordinates rendering and interaction
   * for the main PR data table view.
   * 
   * This orchestrator composes existing helper modules to:
   * - Initialize the PR data tab
   * - Render PR data with filters applied
   * - Handle data refresh events
   * - Coordinate filter changes
   * - Manage tab-specific state
   * 
   * @param {Object} deps - Dependencies
   * @param {Function} deps.deriveRunPrDataContext - Derives PR data context
   * @param {Function} deps.deriveRenderPipelineState - Derives render pipeline state
   * @param {Function} deps.applyFiltersFromCache - Applies cached filters
   * @param {Function} deps.loadStoredData - Loads stored PR data
   * @param {Function} deps.activateDataTab - Activates data tab UI
   * @param {Function} deps.initDataTabs - Initializes data tabs
   * @param {Function} deps.getOptionalElementById - DOM helper
   * @param {Object} deps.stateGetters - Getters for global state
   * @param {Function} deps.stateGetters.getLatestStoredPayload - Get latest payload
   * @param {Function} deps.stateGetters.getLatestSelectedRepo - Get selected repo
   * @param {Function} deps.stateGetters.getLastSuccessfulRenderedCheckAt - Get last render check
   * @param {Function} deps.stateGetters.getLatestSchedulerState - Get scheduler state
   * @param {Object} deps.stateSetters - Setters for global state
   * @param {Function} deps.stateSetters.setLatestStoredPayload - Set latest payload
   * @param {Function} deps.stateSetters.setLastSuccessfulRenderedCheckAt - Set last render check
   * @param {Function} deps.stateSetters.setLastRenderedPrFingerprint - Set PR fingerprint
   * @param {Function} deps.stateSetters.setLatestPrManifest - Set PR manifest
   * @param {Function} deps.stateSetters.setPendingAutoRenderPayload - Set pending auto-render
   * @returns {Object} Orchestrator API
   * @returns {Function} returns.initialize - Initialize PR data tab
   * @returns {Function} returns.renderPrData - Render PR data
   * @returns {Function} returns.handleDataRefresh - Handle data refresh
   * @returns {Function} returns.handleFilterChange - Handle filter change
   * @returns {Function} returns.activateTab - Activate this tab
   * @returns {Function} returns.cleanup - Cleanup tab state
   */
  function createPrDataTabOrchestrator({
    // Helper functions (already extracted)
    deriveRunPrDataContext,
    deriveRenderPipelineState,
    applyFiltersFromCache,
    loadStoredData,
    activateDataTab,
    initDataTabs,
    getOptionalElementById,
    // State management (via dependency injection)
    stateGetters,
    stateSetters,
    // Phase 6 (see REACT_MIGRATION_PLAN.md): optional - when provided,
    // returns "filter-pr-numbers"'s current value from
    // FilterStateProvider's Context, or undefined before the provider
    // mounts/if it's still unmigrated. Defaults to always undefined so
    // this orchestrator (and every existing unit test, which doesn't pass
    // this) falls back to reading the DOM element's `.value` unchanged.
    getFilterStateValue,
  }) {
    const getFilterStateValueSafe =
      typeof getFilterStateValue === "function" ? getFilterStateValue : () => undefined;
    // Private state (tab-specific)
    let isInitialized = false;

    /**
     * Renders PR data by coordinating helper functions.
     * This is the main rendering coordination function for the PR Data tab.
     * 
     * @param {Object} payload - PR data payload
     * @param {string} [selectedRepo=""] - Selected repository
     * @param {Object} [options={}] - Rendering options
     * @param {boolean} [options.useLastRunScope] - Use last run scope
     * @param {boolean} [options.skipTableRender] - Skip building/appending
     *   the vanilla PR table DOM into sectionsHost (used when the React
     *   table owns rendering); the surrounding side effects (data-meta
     *   summary, filter chips, export field catalog, author insights,
     *   stats view) still run either way.
     */
    function renderPrData(payload, selectedRepo = "", options = {}) {
      // Get current state
      const latestStoredPayload = stateGetters.getLatestStoredPayload();
      const lastSuccessfulRenderedCheckAt = stateGetters.getLastSuccessfulRenderedCheckAt();
      const latestSelectedRepo = stateGetters.getLatestSelectedRepo();
      const latestSchedulerState = stateGetters.getLatestSchedulerState();

      // Update payload state
      const effectivePayload = payload || latestStoredPayload;
      stateSetters.setLatestStoredPayload(effectivePayload);

      // Get DOM elements
      const repoInput = getOptionalElementById("repo");
      const filterPrNumbersInput = getOptionalElementById("filter-pr-numbers");

      if (!repoInput || !filterPrNumbersInput) {
        // Cannot render without required DOM elements
        return;
      }

      // Phase 6 (see REACT_MIGRATION_PLAN.md): "filter-pr-numbers" is
      // migrated onto FilterStateProvider's Context - prefer it over the
      // DOM read when the provider has mounted, same handled/fallback
      // shape as everywhere else in this migration.
      const filterPrNumbersOverride = getFilterStateValueSafe("filterPrNumbers");
      const filterPrNumbersRaw =
        typeof filterPrNumbersOverride === "string"
          ? filterPrNumbersOverride.trim()
          : filterPrNumbersInput.value.trim();

      // Derive rendering context using helper
      const runContext = deriveRunPrDataContext({
        payload: effectivePayload,
        selectedRepo,
        inputRepo: repoInput.value.trim(),
        filterPrNumbersRaw,
        optionsUseLastRunScope: options.useLastRunScope,
      });

      // Derive render pipeline state using helper
      const nextRenderPipelineState = deriveRenderPipelineState({
        payload: effectivePayload,
        allEntries: runContext.allEntries,
        repoFilter: runContext.repoFilter,
        lastSuccessfulRenderedCheckAt,
        normalizedRunStamp: runContext.normalizedRunStamp,
        rowsForRepo: runContext.rowsForRepo,
        ignoreScopeForPrNumberFilter: runContext.ignoreScopeForPrNumberFilter,
        runStamp: runContext.runStamp,
        useLastRunScope: runContext.useLastRunScope,
        selectedScope: runContext.selectedScope,
        attentionConfig: runContext.attentionConfig,
        filterPrNumbers: runContext.filterPrNumbers,
        filterPrNumbersRaw: runContext.filterPrNumbersRaw,
        allStoredRows: runContext.allStoredRows,
        sectionsHost: runContext.sectionsHost,
        meta: runContext.meta,
        prSectionOpenState: runContext.prSectionOpenState,
        latestSelectedRepo,
        insightsViewState: runContext.insightsViewState,
        latestSchedulerState,
        skipTableRender: Boolean(options.skipTableRender),
      });

      // Update state from render pipeline
      stateSetters.setLastSuccessfulRenderedCheckAt(
        nextRenderPipelineState.lastSuccessfulRenderedCheckAt
      );

      const committedRenderState = nextRenderPipelineState.committedRenderState;
      stateSetters.setPendingAutoRenderPayload(
        committedRenderState.pendingAutoRenderPayload
      );
      stateSetters.setLastRenderedPrFingerprint(
        committedRenderState.lastRenderedPrFingerprint
      );
      stateSetters.setLatestPrManifest(
        committedRenderState.latestPrManifest
      );

      // Returned so the React rendering path (see index.page.js) can
      // restrict what it renders to the same filtered set this pipeline
      // just computed, instead of showing every stored PR regardless of
      // the active local filters.
      return { filteredRows: committedRenderState.filteredRows || [] };
    }

    /**
     * Initializes the PR Data tab.
     * Sets up tab UI and prepares for rendering.
     */
    function initialize() {
      if (isInitialized) {
        return;
      }

      // Initialize data tabs UI (using existing helper)
      initDataTabs();

      isInitialized = true;
    }

    /**
     * Handles data refresh events.
     * Called when new PR data is available.
     * 
     * @param {Object} payload - New PR data payload
     * @param {string} [repo=""] - Repository name
     */
    function handleDataRefresh(payload, repo = "") {
      if (!isInitialized) {
        return;
      }

      renderPrData(payload, repo);
    }

    /**
     * Handles filter change events.
     * Re-applies filters and re-renders data.
     */
    function handleFilterChange() {
      if (!isInitialized) {
        return;
      }

      // Delegate to existing filter helper
      applyFiltersFromCache();
    }

    /**
     * Activates the PR Data tab.
     * Makes this tab visible and active.
     */
    function activateTab() {
      // Delegate to existing tab activation helper
      activateDataTab("pr-data");
    }

    /**
     * Loads stored PR data for a repository.
     * 
     * @param {string} [repo=""] - Repository name
     * @returns {Promise<void>}
     */
    async function loadData(repo = "") {
      // Delegate to existing data loading helper
      return loadStoredData(repo);
    }

    /**
     * Cleans up tab state.
     * Called when tab is deactivated or page unloads.
     */
    function cleanup() {
      // No cleanup needed currently since helpers manage their own state
      isInitialized = false;
    }

    // Public API
    return {
      initialize,
      renderPrData,
      handleDataRefresh,
      handleFilterChange,
      activateTab,
      loadData,
      cleanup,
    };
  }

  return {
    createPrDataTabOrchestrator,
  };
});
