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
   * @param {Function} deps.renderBackfillStatus - Renders backfill status
   * @param {Function} deps.setBackfillLogMessage - Sets backfill log message
   * @param {Function} deps.getOptionalElementById - DOM helper
   * @param {Function} deps.notifyFailureSnackbar - Shows failure notification
   * @param {Object} deps.stateGetters - Getters for global state
   * @param {Function} deps.stateGetters.getLastBackfillStateKey - Get last state key
   * @param {Object} deps.stateSetters - Setters for global state
   * @param {Function} deps.stateSetters.setLastBackfillStateKey - Set last state key
   * @returns {Object} Orchestrator API
   * @returns {Function} returns.initialize - Initialize Backfill tab
   * @returns {Function} returns.loadStatus - Load backfill status
   * @returns {Function} returns.onTabActivated - Refreshes status/log when this tab becomes active (tab-switching chrome itself lives in pr-management-tabs.helpers.js)
   * @returns {Function} returns.cleanup - Cleanup tab state
   */
  function createBackfillTabOrchestrator({
    // Helper functions (already extracted)
    loadBackfillStatus,
    loadBackfillLogTail: _loadBackfillLogTail,
    renderBackfillStatus,
    setBackfillLogMessage,
    getOptionalElementById: _getOptionalElementById,
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
     * Called when the Backfill tab becomes active. Tab-switching chrome
     * itself (panel visibility/aria-selected) is owned entirely by
     * pr-management-tabs.helpers.js's own activateTab, which calls this
     * afterward (see index.page.js's onBackfillTabActivated wiring) -
     * this orchestrator only owns refreshing status/log on activation,
     * matching the Action Log/Actor Names tabs' own on-activation refresh.
     */
    function onTabActivated() {
      if (isInitialized) {
        void loadStatus({ includeLog: true });
      }
    }

    /**
     * Cleans up tab state.
     * Called when tab is deactivated or page unloads.
     */
    function cleanup() {
      isInitialized = false;
    }

    // Public API. loadStatus/handleAction/refreshStatus used to also be
    // exposed here, but Phase C (see REACT_MIGRATION_PLAN.md, "Full
    // migration roadmap") found they had zero real callers - the vanilla
    // button click handlers always called loadBackfillStatus/
    // handleBackfillAction/loadBackfillLogTail directly, bypassing this
    // orchestrator entirely (same "dead public API surface" pattern
    // already found and cleaned up for pr-data-tab.orchestrator.js).
    // loadStatus stays as an internal function - initialize/onTabActivated
    // still call it directly - it's just no longer part of the public API.
    return {
      initialize,
      onTabActivated,
      cleanup,
    };
  }

  return {
    createBackfillTabOrchestrator,
  };
})();
