/**
 * React Integration Code
 * 
 * This code should be added to index.page.js to enable React rendering.
 * 
 * INSTRUCTIONS:
 * 1. Add the createReactCallbacks() function near the top of the file (after function definitions)
 * 2. Replace the renderPrData() function with the new version below
 * 3. Test by running npm start and opening http://localhost:3456
 */

// ============================================================================
// STEP 1: Add this function after all the vanilla JS function definitions
// (around line 6800, after runClearOnlyWorkflow)
// ============================================================================

/**
 * Create React callback helpers (lazy initialization)
 * This factory creates the callbacks that React uses to communicate with vanilla JS.
 */
let reactCallbacks = null;

function createReactCallbacks() {
  if (reactCallbacks) {
    return reactCallbacks;
  }

  // Check if React callbacks helper is available
  if (!window.ViewPrsReactCallbacksHelpers) {
    console.warn('[ReactIntegration] React callbacks helper not available');
    return null;
  }

  const helpers = window.ViewPrsReactCallbacksHelpers.createReactCallbackHelpers({
    // Pass vanilla JS functions
    toggleInReviewForRow: toggleInReviewForRow,
    toggleFlaggedForRow: toggleFlaggedForRow,
    runAckOnlyWorkflow: runAckOnlyWorkflow,
    runClearOnlyWorkflow: runClearOnlyWorkflow,

    // Update React table function
    updateReactTable: (payload, repo) => {
      if (window.ReactMountBridge?.isMounted?.()) {
        window.ReactMountBridge.update(payload, repo);
      }
    },

    // State getters
    stateGetters: {
      getLatestStoredPayload: () => latestStoredPayload,
      getLatestSelectedRepo: () => latestSelectedRepo,
    },
  });

  reactCallbacks = helpers;
  return helpers;
}

// ============================================================================
// STEP 2: Replace the existing renderPrData() function (around line 6184)
// with this new version
// ============================================================================

const renderPrData = (payload, selectedRepo = "", options = {}) => {
  // Update global state
  if (payload) {
    latestStoredPayload = payload;
  }
  if (selectedRepo) {
    latestSelectedRepo = selectedRepo;
  }

  // Get container element
  const container = document.getElementById('pr-sections');
  if (!container) {
    console.error('[renderPrData] pr-sections container not found');
    return;
  }

  // Check if React is available
  const hasReactBridge = window.ReactMountBridge && typeof window.ReactMountBridge.mount === 'function';
  const hasReactApp = window.mountReactPrTable && typeof window.mountReactPrTable === 'function';

  if (!hasReactBridge || !hasReactApp) {
    console.log('[renderPrData] React not available, using vanilla rendering');
    // Fallback to vanilla rendering via orchestrator
    prDataTabOrchestrator.renderPrData(payload, selectedRepo, options);
    return;
  }

  // ========================================
  // REACT RENDERING PATH
  // ========================================

  console.log('[renderPrData] Using React rendering');

  // Check if already mounted
  if (window.ReactMountBridge.isMounted()) {
    // Already mounted: just update data
    console.log('[renderPrData] Updating React table with new data');
    window.ReactMountBridge.update(
      latestStoredPayload || payload,
      latestSelectedRepo || selectedRepo
    );
    return;
  }

  // First time: mount React
  console.log('[renderPrData] Mounting React table for first time');

  // Create callbacks
  const callbacks = createReactCallbacks();
  if (!callbacks) {
    console.error('[renderPrData] Failed to create React callbacks, falling back to vanilla');
    prDataTabOrchestrator.renderPrData(payload, selectedRepo, options);
    return;
  }

  // Mount React
  const success = window.ReactMountBridge.mount(
    container,
    {
      payload: latestStoredPayload || payload || {},
      selectedRepo: latestSelectedRepo || selectedRepo || '',
    },
    {
      onCheckboxChange: callbacks.handleCheckboxChange,
      onAckAction: callbacks.handleAckAction,
    }
  );

  if (!success) {
    console.error('[renderPrData] React mount failed, falling back to vanilla rendering');
    prDataTabOrchestrator.renderPrData(payload, selectedRepo, options);
  }
};

// ============================================================================
// TESTING CHECKLIST
// ============================================================================

/*
  After adding this code:

  1. Start the servers:
     cd view-prs
     npm start

  2. Open browser:
     http://localhost:3456

  3. Check console for:
     ✅ [React Migration] React PR table mounted successfully
     ✅ [renderPrData] Using React rendering
     ✅ [renderPrData] Mounting React table for first time
     ❌ No errors

  4. Test features:
     ✅ Sections appear (smart groups + lifecycle)
     ✅ PRs populate
     ✅ Click checkbox (flagged) - should update
     ✅ Click checkbox (in review) - should update
     ✅ Click Ack button - should toggle
     ✅ Expand/collapse sections
     ✅ Expand/collapse More Insights
     ✅ Needs attention icons show
     ✅ Lifecycle badges in smart groups

  5. Test updates:
     ✅ Wait 30 seconds for auto-refresh
     ✅ Change filters - table updates
     ✅ Switch repos - table updates

  6. Performance check:
     ✅ Open React DevTools
     ✅ Check that PrRow components have memo
     ✅ Change one PR - only that row should re-render

*/

// ============================================================================
// ROLLBACK PLAN
// ============================================================================

/*
  If React rendering doesn't work:

  1. The fallback is already built in - vanilla rendering will work
  2. To disable React completely, comment out the React path:

  const renderPrData = (payload, selectedRepo = "", options = {}) => {
    // Force vanilla rendering
    prDataTabOrchestrator.renderPrData(payload, selectedRepo, options);
  };

  3. Or remove the React scripts from index.html:
     - <script src="./helpers/react-callbacks.helpers.js"></script>
     - <script src="./react-mount-bridge.js"></script>
     - <script type="module" src="/react-app.jsx"></script>
*/
