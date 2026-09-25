// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui orchestrator/helper file still uses - the
// factory body below is unchanged, only the export mechanism differs.
// index.page.js imports this directly instead of using the
// require()/globalThis.ViewPrsBackfillTabOrchestrator fallback.
export const { createBackfillTabOrchestrator } = (function () {
  "use strict";

  /**
   * Creates Backfill Tab orchestrator that coordinates rendering and interaction
   * for the backfill management view.
   * 
   * This orchestrator composes existing helper modules to:
   * - Initialize the Backfill tab
   * - Render backfill status
   * - Handle backfill actions (start, stop, clear)
   * - Load and display backfill logs
   * - Manage auto-refresh polling
   * - Coordinate tab-specific state
   * 
   * @param {Object} deps - Dependencies
   * @param {Function} deps.loadBackfillStatus - Loads backfill status from server
   * @param {Function} deps.loadBackfillLogTail - Loads backfill log tail
   * @param {Function} deps.handleBackfillAction - Handles backfill actions
   * @param {Function} deps.renderBackfillStatus - Renders backfill status
   * @param {Function} deps.setBackfillLogMessage - Sets backfill log message
   * @param {Function} deps.activateDataTab - Activates data tab UI
   * @param {Function} deps.getOptionalElementById - DOM helper
   * @param {Function} deps.beginRequestActivity - Begins request activity indicator
   * @param {Function} deps.notifyFailureSnackbar - Shows failure notification
   * @param {Object} deps.stateGetters - Getters for global state
   * @param {Function} deps.stateGetters.getLastBackfillStateKey - Get last state key
   * @param {Object} deps.stateSetters - Setters for global state
   * @param {Function} deps.stateSetters.setLastBackfillStateKey - Set last state key
   * @returns {Object} Orchestrator API
   * @returns {Function} returns.initialize - Initialize Backfill tab
   * @returns {Function} returns.loadStatus - Load backfill status
   * @returns {Function} returns.handleAction - Handle backfill action
   * @returns {Function} returns.activateTab - Activate this tab
   * @returns {Function} returns.refreshStatus - Refresh backfill status
   * @returns {Function} returns.cleanup - Cleanup tab state
   */
  function createBackfillTabOrchestrator({
    // Helper functions (already extracted)
    loadBackfillStatus,
    loadBackfillLogTail: _loadBackfillLogTail,
    handleBackfillAction,
    renderBackfillStatus,
    setBackfillLogMessage,
    activateDataTab,
    getOptionalElementById: _getOptionalElementById,
    beginRequestActivity,
    notifyFailureSnackbar,
    // State management (via dependency injection)
    stateGetters: _stateGetters,
    stateSetters: _stateSetters,
  }) {
    // Private state (tab-specific)
    let isInitialized = false;

    /**
     * Loads and renders backfill status.
     * 
     * @param {Object} [options={}] - Load options
     * @param {boolean} [options.announce=false] - Whether to announce changes
     * @param {boolean} [options.includeLog=false] - Whether to include log
     */
    async function loadStatus(options = {}) {
      if (!isInitialized) {
        return;
      }

      try {
        await loadBackfillStatus(options);
      } catch (error) {
        renderBackfillStatus({
          ok: false,
          running: false,
          summary: error?.result?.summary || "Failed to load backfill status",
          error: error?.result?.error || error.message,
        });
        setBackfillLogMessage("Failed to load backfill log");
        notifyFailureSnackbar(
          "Failed to load backfill status",
          error?.result || error,
          "Unable to load backfill status",
        );
      }
    }

    /**
     * Initializes the Backfill tab.
     * Sets up tab UI and loads initial status.
     */
    function initialize() {
      if (isInitialized) {
        return;
      }

      isInitialized = true;

      // Load initial status
      void loadStatus({ includeLog: true });
    }

    /**
     * Handles backfill actions (start, stop, clear).
     * 
     * @param {string} action - Action to perform ("start", "stop", "clear")
     * @param {Object} [options={}] - Action options
     */
    async function performAction(action, options = {}) {
      if (!isInitialized) {
        return;
      }

      const finishActivity = beginRequestActivity("backfill");

      try {
        await handleBackfillAction(action, options);
        // Reload status after action
        await loadStatus({ announce: true, includeLog: true });
      } catch (error) {
        renderBackfillStatus({
          ok: false,
          running: false,
          summary: error?.result?.summary || `Failed to ${action} backfill`,
          error: error?.result?.error || error.message,
        });
        notifyFailureSnackbar(
          `Failed to ${action} backfill`,
          error?.result || error,
          `Unable to ${action} backfill`,
        );
      } finally {
        finishActivity();
      }
    }

    /**
     * Activates the Backfill tab.
     * Makes this tab visible and active.
     */
    function activateTab() {
      // Delegate to existing tab activation helper
      activateDataTab("backfill");

      // Refresh status when tab becomes active
      if (isInitialized) {
        void loadStatus({ includeLog: true });
      }
    }

    /**
     * Refreshes backfill status.
     * Called by refresh button or polling.
     * 
     * @param {Object} [options={}] - Refresh options
     * @param {boolean} [options.announce=true] - Whether to announce changes
     */
    async function refreshStatus(options = {}) {
      const opts = { announce: true, includeLog: true, ...options };
      return loadStatus(opts);
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
      loadStatus,
      handleAction: performAction,
      activateTab,
      refreshStatus,
      cleanup,
    };
  }

  return {
    createBackfillTabOrchestrator,
  };
})();
