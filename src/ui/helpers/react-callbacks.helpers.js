/**
 * React Callbacks Helper
 * 
 * This module creates the callback functions that React components use
 * to communicate back to vanilla JS (checkbox changes, Ack actions, etc.)
 * 
 * Phase 1: Hybrid React Table Migration
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.ViewPrsReactCallbacksHelpers = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  /**
   * Create React callback helpers
   * 
   * @param {Object} deps - Dependencies
   * @param {Function} deps.toggleInReviewForRow - Toggle in-review flag
   * @param {Function} deps.toggleFlaggedForRow - Toggle flagged flag
   * @param {Function} deps.runAckOnlyWorkflow - Run Ack workflow
   * @param {Function} deps.runClearOnlyWorkflow - Run Clear Ack workflow
   * @param {Function} deps.updateReactTable - Update React table (if mounted)
   * @param {Object} deps.stateGetters - State getters
   * @param {Function} deps.stateGetters.getLatestStoredPayload - Get latest payload
   * @param {Function} deps.stateGetters.getLatestSelectedRepo - Get selected repo
   * @returns {Object} Callback functions for React
   */
  const createReactCallbackHelpers = ({
    toggleInReviewForRow,
    toggleFlaggedForRow,
    runAckOnlyWorkflow,
    runClearOnlyWorkflow,
    updateReactTable,
    stateGetters,
  } = {}) => {
    // Safe wrappers
    const toggleInReviewForRowSafe =
      typeof toggleInReviewForRow === 'function'
        ? toggleInReviewForRow
        : () => Promise.resolve();

    const toggleFlaggedForRowSafe =
      typeof toggleFlaggedForRow === 'function'
        ? toggleFlaggedForRow
        : () => Promise.resolve();

    const runAckOnlyWorkflowSafe =
      typeof runAckOnlyWorkflow === 'function'
        ? runAckOnlyWorkflow
        : () => Promise.resolve();

    const runClearOnlyWorkflowSafe =
      typeof runClearOnlyWorkflow === 'function'
        ? runClearOnlyWorkflow
        : () => Promise.resolve();

    const updateReactTableSafe =
      typeof updateReactTable === 'function' ? updateReactTable : () => {};

    const getLatestStoredPayloadSafe =
      typeof stateGetters?.getLatestStoredPayload === 'function'
        ? stateGetters.getLatestStoredPayload
        : () => ({});

    const getLatestSelectedRepoSafe =
      typeof stateGetters?.getLatestSelectedRepo === 'function'
        ? stateGetters.getLatestSelectedRepo
        : () => '';

    /**
     * Handle checkbox change from React component
     *
     * @param {number} prNumber - PR number
     * @param {string} type - Checkbox type ('flagged' or 'inReview')
     * @param {boolean} checked - New checked state
     * @param {string} [repoOverride] - The PR's repo, from PrTableApp's resolved
     *   `effectiveRepo`. The vanilla `latestSelectedRepo` global this used to
     *   fall back to is frequently empty (nothing requires the "repo" input
     *   to be filled in), which sent `{"repo":""}` to the server.
     * @returns {Promise<void>}
     */
    const handleCheckboxChange = async (prNumber, type, checked, repoOverride) => {
      try {
        const repo = repoOverride || getLatestSelectedRepoSafe();

        // Vanilla functions expect: (entry, row, nextValue, checkbox)
        // We'll create minimal objects that satisfy the interface
        const entry = { prNumber: String(prNumber), repo };
        const row = { number: prNumber };
        const mockCheckbox = { checked }; // For rollback if error

        // Call vanilla toggle function and wait for completion
        // This updates latestStoredPayload.flaggedByRepo or .inReviewByRepo
        if (type === 'flagged') {
          await toggleFlaggedForRowSafe(entry, row, checked, mockCheckbox);
        } else if (type === 'inReview') {
          await toggleInReviewForRowSafe(entry, row, checked, mockCheckbox);
        }

        // CRITICAL: Always update React after checkbox toggle
        // The vanilla toggle functions update latestStoredPayload in memory
        // but skip renderPrData() for performance (checkbox already visually updated in vanilla)
        // For React, we MUST trigger a re-render to:
        // 1. Update checkbox state in all sections (same PR can appear in multiple smart groups)
        // 2. Rebuild smart groups (add/remove PR from Flagged/In Review groups)

        // Get UPDATED payload (toggle function has modified latestStoredPayload by now)
        const payload = getLatestStoredPayloadSafe();

        console.log(`[ReactCallbacks] Updating React after ${type} toggle for PR #${prNumber}`);
        updateReactTableSafe(payload, repo);
      } catch (error) {
        console.error('[ReactCallbacks] Error handling checkbox change:', error);
      }
    };

    /**
     * Handle Ack button click from React component
     *
     * @param {number} prNumber - PR number
     * @param {boolean} isAcked - Current ack state
     * @param {string} [repoOverride] - The PR's repo (see handleCheckboxChange)
     * @returns {Promise<void>}
     */
    const handleAckAction = async (prNumber, isAcked, repoOverride) => {
      try {
        const prNumberStr = String(prNumber);
        const repo = repoOverride || getLatestSelectedRepoSafe();

        if (isAcked) {
          // PR is already acked, so clear it
          await runClearOnlyWorkflowSafe(prNumberStr, repo);
        } else {
          // PR is not acked, so ack it
          await runAckOnlyWorkflowSafe(prNumberStr, repo);
        }

        // Update React with latest data
        const payload = getLatestStoredPayloadSafe();
        updateReactTableSafe(payload, repo);
      } catch (error) {
        console.error('[ReactCallbacks] Error handling Ack action:', error);
      }
    };

    return {
      handleCheckboxChange,
      handleAckAction,
    };
  };

  return {
    createReactCallbackHelpers,
  };
});
