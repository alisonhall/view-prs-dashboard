(function (global, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    global.ViewPrsReviewStatsTabOrchestrator = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * Creates Review Stats Tab orchestrator that coordinates rendering and interaction
   * for the review statistics view.
   * 
   * This orchestrator composes existing helper modules and components to:
   * - Initialize the Review Stats tab
   * - Render review statistics
   * - Handle date range changes
   * - Handle filter/sort changes
   * - Coordinate tab-specific state
   * 
   * @param {Object} deps - Dependencies
   * @param {Function} deps.renderStatsView - Renders review stats view
   * @param {Function} deps.activateDataTab - Activates data tab UI
   * @param {Function} deps.getOptionalElementById - DOM helper
   * @param {Object} deps.stateGetters - Getters for global state
   * @param {Function} deps.stateGetters.getStatsViewState - Get stats view state
   * @param {Function} deps.stateGetters.getLatestRows - Get latest PR rows
   * @param {Function} deps.stateGetters.getLatestActorsMap - Get actors map
   * @param {Object} deps.stateSetters - Setters for global state
   * @param {Function} deps.stateSetters.setStatsViewState - Set stats view state
   * @returns {Object} Orchestrator API
   * @returns {Function} returns.initialize - Initialize Review Stats tab
   * @returns {Function} returns.render - Render review stats
   * @returns {Function} returns.handleDateRangeChange - Handle date range changes
   * @returns {Function} returns.handleFilterChange - Handle filter/sort changes
   * @returns {Function} returns.activateTab - Activate this tab
   * @returns {Function} returns.cleanup - Cleanup tab state
   */
  function createReviewStatsTabOrchestrator({
    // Helper functions (already extracted)
    renderStatsView,
    activateDataTab,
    getOptionalElementById,
    // State management (via dependency injection)
    stateGetters,
    stateSetters,
  }) {
    // Private state (tab-specific)
    let isInitialized = false;

    /**
     * Renders review stats by delegating to the renderStatsView function.
     */
    function render() {
      if (!isInitialized) {
        return;
      }

      const rows = stateGetters.getLatestRows();
      const actorsMap = stateGetters.getLatestActorsMap();

      // Get DOM element
      const container = getOptionalElementById("pr-stats");
      if (!container) {
        return;
      }

      // Delegate to renderStatsView
      renderStatsView(rows, actorsMap);
    }

    /**
     * Initializes the Review Stats tab.
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
     * Handles date range changes.
     * Called when user changes start/end date.
     * 
     * @param {Object} dateRange - Date range
     * @param {string} dateRange.startDate - Start date (YYYY-MM-DD)
     * @param {string} dateRange.endDate - End date (YYYY-MM-DD)
     */
    function handleDateRangeChange(dateRange) {
      if (!isInitialized) {
        return;
      }

      // Update state
      const currentState = stateGetters.getStatsViewState();
      const newState = {
        ...currentState,
        startDate: dateRange.startDate || currentState.startDate,
        endDate: dateRange.endDate || currentState.endDate,
      };
      stateSetters.setStatsViewState(newState);

      // Re-render with new date range
      render();
    }

    /**
     * Handles filter and sort changes.
     * Called when user changes sortBy, filterMode, or topN.
     * 
     * @param {Object} options - Filter/sort options
     * @param {string} [options.sortBy] - Sort field
     * @param {string} [options.filterMode] - Filter mode
     * @param {number} [options.topN] - Top N to display
     */
    function handleFilterChange(options) {
      if (!isInitialized) {
        return;
      }

      // Update state
      const currentState = stateGetters.getStatsViewState();
      const newState = {
        ...currentState,
        ...options,
      };
      stateSetters.setStatsViewState(newState);

      // Re-render with new filters
      render();
    }

    /**
     * Activates the Review Stats tab.
     * Makes this tab visible and active.
     */
    function activateTab() {
      // Delegate to existing tab activation helper
      activateDataTab("review-stats");

      // Render when tab becomes active
      if (isInitialized) {
        render();
      }
    }

    /**
     * Updates stats data.
     * Called when new PR data is loaded.
     * 
     * @param {Array} rows - PR rows
     * @param {Object} actorsMap - Actor information map
     */
    function updateData(rows, actorsMap) {
      if (!isInitialized) {
        return;
      }

      // Re-render with new data
      render();
    }

    /**
     * Cleans up tab state.
     * Called when tab is deactivated or page unloads.
     */
    function cleanup() {
      isInitialized = false;
    }

    // Public API
    return {
      initialize,
      render,
      handleDateRangeChange,
      handleFilterChange,
      activateTab,
      updateData,
      cleanup,
    };
  }

  return {
    createReviewStatsTabOrchestrator,
  };
});
