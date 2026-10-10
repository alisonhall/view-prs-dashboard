/**
 * React Callbacks Helper
 * 
 * This module creates the callback functions that React components use
 * to communicate back to vanilla JS (checkbox changes, Ack actions, etc.)
 * 
 * Phase 1: Hybrid React Table Migration
 */

// ES module cleanup (see REACT_MIGRATION_PLAN.md): converted from the UMD
// wrapper every other src/ui/helpers file still uses - the factory body
// below is unchanged, only the export mechanism differs. index.page.js
// imports this directly instead of using the
// require()/globalThis.ViewPrsReactCallbacksHelpers fallback.
export const { createReactCallbackHelpers } = (() => {
  /**
   * Create React callback helpers
   *
   * Phase 7, sub-phase 7.3 follow-up (see REACT_MIGRATION_PLAN.md): each
   * handler below pushes into React using the vanilla action function's
   * own RETURN VALUE (`{ payload, selectedRepo }` on success, `null` on
   * failure), not a readback of a shared module variable - the vanilla
   * functions already compute that value locally before writing it to
   * `latestStoredPayload`, so there's no need to read it back at all.
   *
   * @param {Object} deps - Dependencies
   * @param {Function} deps.toggleInReviewForRow - Toggle in-review flag
   * @param {Function} deps.toggleFlaggedForRow - Toggle flagged flag
   * @param {Function} deps.runAckOnlyWorkflow - Run Ack workflow
   * @param {Function} deps.runClearOnlyWorkflow - Run Clear Ack workflow
   * @param {Function} deps.updateReactTable - Update React table (if mounted)
   * @param {Object} deps.stateGetters - State getters
   * @param {Function} deps.stateGetters.getLatestSelectedRepo - Get selected repo
   * @returns {Object} Callback functions for React
   */
  const createReactCallbackHelpers = ({
    toggleInReviewForRow,
    toggleFlaggedForRow,
    runAckOnlyWorkflow,
    runClearOnlyWorkflow,
    runApplyLabelWorkflow,
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

    const runApplyLabelWorkflowSafe =
      typeof runApplyLabelWorkflow === 'function'
        ? runApplyLabelWorkflow
        : () => Promise.resolve();

    const updateReactTableSafe =
      typeof updateReactTable === 'function' ? updateReactTable : () => {};

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

        // Call vanilla toggle function and wait for completion - returns
        // { payload, selectedRepo } on success, null on failure (see that
        // function's own comment).
        const result =
          type === 'flagged'
            ? await toggleFlaggedForRowSafe(entry, row, checked, mockCheckbox)
            : type === 'inReview'
              ? await toggleInReviewForRowSafe(entry, row, checked, mockCheckbox)
              : null;

        // CRITICAL: Always update React after a successful checkbox toggle
        // The vanilla toggle functions update latestStoredPayload in memory
        // but skip renderPrData() for performance (checkbox already visually updated in vanilla)
        // For React, we MUST trigger a re-render to:
        // 1. Update checkbox state in all sections (same PR can appear in multiple smart groups)
        // 2. Rebuild smart groups (add/remove PR from Flagged/In Review groups)
        if (result) {
          updateReactTableSafe(result.payload, result.selectedRepo || repo);
        }
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

        // PR is already acked -> clear it, otherwise ack it. Returns
        // { payload, selectedRepo } on success, null on failure.
        const result = isAcked
          ? await runClearOnlyWorkflowSafe(prNumberStr, repo)
          : await runAckOnlyWorkflowSafe(prNumberStr, repo);

        if (result) {
          updateReactTableSafe(result.payload, result.selectedRepo || repo);
        }
      } catch (error) {
        console.error('[ReactCallbacks] Error handling Ack action:', error);
      }
    };

    /**
     * Handle "add label" selection from React component
     *
     * @param {number} prNumber - PR number
     * @param {string} label - Label name to apply
     * @param {string} [repoOverride] - The PR's repo (see handleCheckboxChange)
     * @returns {Promise<void>}
     */
    const handleApplyLabel = async (prNumber, label, repoOverride) => {
      try {
        const repo = repoOverride || getLatestSelectedRepoSafe();

        const result = await runApplyLabelWorkflowSafe(String(prNumber), label, repo);

        if (result) {
          updateReactTableSafe(result.payload, result.selectedRepo || repo);
        }
      } catch (error) {
        console.error('[ReactCallbacks] Error handling Apply Label action:', error);
      }
    };

    return {
      handleCheckboxChange,
      handleAckAction,
      handleApplyLabel,
    };
  };

  return {
    createReactCallbackHelpers,
  };
})();
