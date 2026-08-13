(function (global, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    global.ViewPrsAuthorInsightsTabOrchestrator = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Creates Author Insights Tab orchestrator that coordinates rendering and interaction
   * for the author insights view.
   * 
   * This orchestrator composes existing helper modules and the Author Insights component to:
   * - Initialize the Author Insights tab
   * - Render author insights data
   * - Handle author selection changes
   * - Manage manual comments and drafts
   * - Coordinate tab-specific state
   * 
   * @param {Object} deps - Dependencies
   * @param {Function} deps.renderAuthorInsights - Renders author insights component
   * @param {Function} deps.activateDataTab - Activates data tab UI
   * @param {Function} deps.getOptionalElementById - DOM helper
   * @param {Object} deps.stateGetters - Getters for global state
   * @param {Function} deps.stateGetters.getAuthorInsightsState - Get author insights state
   * @param {Function} deps.stateGetters.getLatestStoredPayload - Get latest payload
   * @param {Function} deps.stateGetters.getLatestSelectedRepo - Get selected repo
   * @param {Object} deps.stateSetters - Setters for global state
   * @param {Function} deps.stateSetters.setSelectedAuthorLogin - Set selected author
   * @param {Function} deps.stateSetters.setLatestRows - Set latest rows
   * @param {Function} deps.stateSetters.setLatestActorsMap - Set actors map
   * @returns {Object} Orchestrator API
   * @returns {Function} returns.initialize - Initialize Author Insights tab
   * @returns {Function} returns.renderAuthorInsights - Render author insights
   * @returns {Function} returns.handleAuthorSelection - Handle author selection
   * @returns {Function} returns.activateTab - Activate this tab
   * @returns {Function} returns.cleanup - Cleanup tab state
   */
  function createAuthorInsightsTabOrchestrator({
    // Helper functions (already extracted)
    renderAuthorInsights,
    activateDataTab,
    getOptionalElementById,
    // State management (via dependency injection)
    stateGetters,
    stateSetters,
  }) {
    // Private state (tab-specific)
    let isInitialized = false;

    /**
     * Renders author insights by delegating to the component.
     * 
     * @param {Object} [options={}] - Rendering options
     * @param {string} [options.selectedAuthorLogin] - Author to select
     */
    function render(options = {}) {
      if (!isInitialized) {
        return;
      }

      const authorInsightsState = stateGetters.getAuthorInsightsState();
      const latestStoredPayload = stateGetters.getLatestStoredPayload();
      const latestSelectedRepo = stateGetters.getLatestSelectedRepo();

      // Get DOM element
      const container = getOptionalElementById("tab-panel-author-insights");
      if (!container) {
        return;
      }

      // Delegate to Author Insights component
      renderAuthorInsights({
        payload: latestStoredPayload,
        selectedRepo: latestSelectedRepo,
        authorInsightsState,
        selectedAuthorLogin: options.selectedAuthorLogin,
      });
    }

    /**
     * Initializes the Author Insights tab.
     * Sets up tab UI and prepares for rendering.
     */
    function initialize() {
      if (isInitialized) {
        return;
      }

      // Tab initialization (tab buttons are set up by initDataTabs in PR Data orchestrator)
      isInitialized = true;
    }

    /**
     * Handles author selection changes.
     * Called when user selects a different author.
     * 
     * @param {string} authorLogin - Selected author login
     */
    function handleAuthorSelection(authorLogin) {
      if (!isInitialized) {
        return;
      }

      // Update state
      stateSetters.setSelectedAuthorLogin(authorLogin);

      // Re-render with new selection
      render({ selectedAuthorLogin: authorLogin });
    }

    /**
     * Activates the Author Insights tab.
     * Makes this tab visible and active.
     */
    function activateTab() {
      // Delegate to existing tab activation helper
      activateDataTab("author-insights");

      // Render when tab becomes active
      if (isInitialized) {
        render();
      }
    }

    /**
     * Updates author insights data.
     * Called when new PR data is loaded.
     * 
     * @param {Object} payload - New PR data payload
     * @param {Array} rows - PR rows for insights
     * @param {Object} actorsMap - Actor information map
     */
    function updateData(payload, rows, actorsMap) {
      if (!isInitialized) {
        return;
      }

      // Update state
      if (rows) {
        stateSetters.setLatestRows(rows);
      }
      if (actorsMap) {
        stateSetters.setLatestActorsMap(actorsMap);
      }

      // Re-render with new data
      render();
    }

    /**
     * Cleans up tab state.
     * Called when tab is deactivated or page unloads.
     */
    function cleanup() {
      // No cleanup needed currently since component manages its own state
      isInitialized = false;
    }

    // Public API
    return {
      initialize,
      render,
      handleAuthorSelection,
      activateTab,
      updateData,
      cleanup,
    };
  }

  return {
    createAuthorInsightsTabOrchestrator,
  };
});
